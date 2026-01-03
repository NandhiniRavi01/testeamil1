#!/usr/bin/env python3
"""
clean_db.py

Safely clear the application's SQLite database, preserving only users with role 'super_admin'.

Usage:
  python clean_db.py         # will prompt for confirmation
  python clean_db.py --yes   # run without prompt

This script will:
 - create a backup copy of the DB file next to the original
 - delete all rows from every table except `users`
 - in `users`, delete all rows where role != 'super_admin'
 - reset sqlite_sequence entries and run VACUUM

Make sure to stop the application before running.
"""

import os
import shutil
import sqlite3
import argparse
from datetime import datetime


def backup_db(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Database file not found: {db_path}")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{db_path}.backup.{ts}"
    shutil.copy2(db_path, backup_path)
    return backup_path


def get_tables(conn):
    cur = conn.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%';
    """)
    return [r[0] for r in cur.fetchall()]


def clear_database(db_path, preserve_roles=('super_admin',)):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cur = conn.cursor()

        # Turn off foreign key constraints for deletion order simplicity
        cur.execute("PRAGMA foreign_keys = OFF;")

        # Capture super_admin user rows (full row) before wiping
        cur.execute("PRAGMA table_info(users)")
        users_cols = [r[1] for r in cur.fetchall()]

        cur.execute("SELECT * FROM users WHERE role = ?", (preserve_roles[0],))
        super_rows = [dict(r) for r in cur.fetchall()]

        print(f"Found {len(super_rows)} super_admin user(s) to preserve (credentials only).")

        # Get list of user tables and wipe everything
        tables = get_tables(conn)

        for table in tables:
            cur.execute(f"DELETE FROM {table};")
            print(f"Cleared table: {table}")
            try:
                cur.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            except sqlite3.Error:
                pass

        conn.commit()

        # Re-insert only credential columns for super_admin users into `users` table
        if super_rows:
            # Choose which columns to restore: minimal credential fields plus role and is_active
            keep_cols = [c for c in ['id', 'username', 'email', 'password_hash', 'role', 'created_at', 'is_active'] if c in users_cols]
            col_list = ','.join(keep_cols)
            placeholders = ','.join('?' for _ in keep_cols)

            insert_sql = f"INSERT INTO users ({col_list}) VALUES ({placeholders})"

            for row in super_rows:
                values = [row.get(c) for c in keep_cols]
                cur.execute(insert_sql, values)

            # Reset sqlite_sequence for users to max(id)
            try:
                cur.execute("SELECT MAX(id) FROM users")
                max_id = cur.fetchone()[0] or 0
                cur.execute("UPDATE sqlite_sequence SET seq = ? WHERE name = 'users'", (max_id,))
            except sqlite3.Error:
                pass

            conn.commit()
            print(f"Restored {len(super_rows)} super_admin user(s) with credential fields: {', '.join(keep_cols)}")
        else:
            print("No super_admin users found in DB; DB is empty now.")

        # VACUUM to reclaim space
        cur.execute("VACUUM;")
        conn.commit()
        print("Database cleared and vacuumed successfully. Only super_admin credentials preserved.")

    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Clear DB but preserve super_admin users")
    parser.add_argument('--db', help='Path to sqlite DB file (overrides env DB_PATH)', default=None)
    parser.add_argument('--yes', action='store_true', help='Do not prompt for confirmation')
    args = parser.parse_args()

    db_path = args.db or os.environ.get('DB_PATH', 'email_sender.db')

    print(f"Target DB: {db_path}")
    if not os.path.exists(db_path):
        print("ERROR: DB file does not exist.")
        return

    if not args.yes:
        confirm = input("This will DELETE data. Type 'YES' to continue: ")
        if confirm.strip() != 'YES':
            print("Aborted by user.")
            return

    print("Creating backup...")
    backup_path = backup_db(db_path)
    print(f"Backup created at: {backup_path}")

    try:
        clear_database(db_path, preserve_roles=('super_admin',))
    except Exception as e:
        print(f"Error during clearing DB: {e}")
        print(f"You can restore from backup: {backup_path}")
        return

    print("Done. Verify the DB and restart the application if needed.")


if __name__ == '__main__':
    main()
