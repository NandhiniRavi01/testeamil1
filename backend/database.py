import sqlite3
import hashlib
import os
import secrets
from datetime import datetime, timedelta
from dotenv import load_dotenv

class Database:
    def __init__(self):
        load_dotenv()
        self.db_path = os.getenv("DB_PATH", "email_sender.db")
        self.create_database_and_tables()

    def get_connection(self):
        try:
            connection = sqlite3.connect(self.db_path)
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            return connection
        except sqlite3.Error as e:
            print(f"Error connecting to SQLite: {e}")
            return None
    
    def get_current_timestamp(self):
        """Get current timestamp in SQLite compatible format"""
        return datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    def normalize_user_id(self, user_id):
        """Convert user_id to integer, handling 'default_user' string"""
        if isinstance(user_id, str) and user_id == "default_user":
            return self.get_or_create_default_user()
        try:
            return int(user_id)
        except (ValueError, TypeError):
            return self.get_or_create_default_user()

    def get_user_id_from_session(self, session_token):
        """Get user ID from session token"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT user_id FROM user_sessions 
                    WHERE session_token = ? AND expires_at > datetime('now')
                """, (session_token,))
                result = cursor.fetchone()
                return result[0] if result else None
            except sqlite3.Error as e:
                print(f"Error getting user from session: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def ensure_user_access(self, user_id, table_name, record_id):
        """Verify that a record belongs to the specified user"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if table_name == 'uploaded_files':
                    cursor.execute("SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?", 
                                 (record_id, normalized_user_id))
                elif table_name == 'email_campaigns':
                    cursor.execute("SELECT id FROM email_campaigns WHERE id = ? AND user_id = ?", 
                                 (record_id, normalized_user_id))
                elif table_name == 'follow_up_campaigns':
                    cursor.execute("SELECT id FROM follow_up_campaigns WHERE id = ? AND user_id = ?", 
                                 (record_id, normalized_user_id))
                elif table_name == 'sent_emails':
                    cursor.execute("""
                        SELECT se.id FROM sent_emails se
                        JOIN email_campaigns ec ON se.campaign_id = ec.id
                        WHERE se.id = ? AND ec.user_id = ?
                    """, (record_id, normalized_user_id))
                elif table_name == 'email_tracking':
                    cursor.execute("""
                        SELECT et.id FROM email_tracking et
                        JOIN email_campaigns ec ON et.campaign_id = ec.id
                        WHERE et.id = ? AND ec.user_id = ?
                    """, (record_id, normalized_user_id))
                elif table_name == 'email_templates':
                    cursor.execute("SELECT id FROM email_templates WHERE id = ? AND user_id = ?", 
                                 (record_id, normalized_user_id))
                elif table_name == 'sender_accounts':
                    cursor.execute("SELECT id FROM sender_accounts WHERE id = ? AND user_id = ?", 
                                 (record_id, normalized_user_id))
                
                result = cursor.fetchone()
                return result is not None
            except sqlite3.Error as e:
                print(f"Error verifying user access: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def migrate_database(self):
        """Apply database migrations for new columns"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # Check and add columns for uploaded_files table
                cursor.execute("PRAGMA table_info(uploaded_files)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                columns_to_add = [
                    ('total_records', 'INTEGER DEFAULT 0'),
                    ('column_count', 'INTEGER DEFAULT 0'),
                    ('row_count', 'INTEGER DEFAULT 0'),
                    ('file_type', 'TEXT'),
                    ('file_data', 'BLOB')
                ]
                
                for column_name, column_type in columns_to_add:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to uploaded_files table...")
                        cursor.execute(f"ALTER TABLE uploaded_files ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for email_campaigns table
                cursor.execute("PRAGMA table_info(email_campaigns)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                email_campaigns_columns = [
                    ('file_id', 'INTEGER'),
                    ('campaign_name', 'TEXT'),
                    ('total_recipients', 'INTEGER DEFAULT 0'),
                    ('emails_sent', 'INTEGER DEFAULT 0'),
                    ('batch_size', 'INTEGER DEFAULT 250'),
                    ('use_templates', 'INTEGER DEFAULT 0'),
                    ('status', 'TEXT DEFAULT "pending"'),
                    ('started_at', 'TIMESTAMP'),
                    ('completed_at', 'TIMESTAMP'),
                    ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
                ]
                
                for column_name, column_type in email_campaigns_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to email_campaigns table...")
                        cursor.execute(f"ALTER TABLE email_campaigns ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for sent_emails table
                cursor.execute("PRAGMA table_info(sent_emails)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                sent_emails_columns = [
                    ('campaign_id', 'INTEGER'),
                    ('recipient_email', 'TEXT NOT NULL'),
                    ('recipient_name', 'TEXT'),
                    ('recipient_position', 'TEXT'),
                    ('sender_email', 'TEXT NOT NULL'),
                    ('sender_name', 'TEXT'),
                    ('subject', 'TEXT'),
                    ('body', 'TEXT'),
                    ('template_used', 'TEXT'),
                    ('sent_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('status', 'TEXT DEFAULT "sent"'),
                    ('error_message', 'TEXT')
                ]
                
                for column_name, column_type in sent_emails_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to sent_emails table...")
                        cursor.execute(f"ALTER TABLE sent_emails ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for follow_up_campaigns table
                cursor.execute("PRAGMA table_info(follow_up_campaigns)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                follow_up_columns = [
                    ('follow_up_subject', 'TEXT'),
                    ('follow_up_body', 'TEXT'),
                    ('user_id', 'INTEGER')
                ]
                
                for column_name, column_type in follow_up_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to follow_up_campaigns table...")
                        cursor.execute(f"ALTER TABLE follow_up_campaigns ADD COLUMN {column_name} {column_type}")
                        
                        if column_name == 'follow_up_subject':
                            cursor.execute("UPDATE follow_up_campaigns SET follow_up_subject = 'Follow-up' WHERE follow_up_subject IS NULL")
                        elif column_name == 'follow_up_body':
                            cursor.execute("UPDATE follow_up_campaigns SET follow_up_body = 'Follow-up email' WHERE follow_up_body IS NULL")
                        elif column_name == 'user_id':
                            default_user_id = self.get_or_create_default_user()
                            if default_user_id:
                                cursor.execute("UPDATE follow_up_campaigns SET user_id = ? WHERE user_id IS NULL", (default_user_id,))
                        
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for email_tracking table
                cursor.execute("PRAGMA table_info(email_tracking)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                email_tracking_columns = [
                    ('campaign_id', 'INTEGER'),
                    ('recipient_email', 'TEXT NOT NULL'),
                    ('recipient_name', 'TEXT'),
                    ('sender_email', 'TEXT'),
                    ('sent_time', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('status', 'TEXT DEFAULT "sent"'),
                    ('reply_time', 'TIMESTAMP'),
                    ('reply_message', 'TEXT'),
                    ('bounce_type', 'TEXT'),
                    ('bounce_reason', 'TEXT'),
                    ('last_checked', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('classification_reason', 'TEXT')  # ADDED THIS COLUMN
                ]
                
                for column_name, column_type in email_tracking_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to email_tracking table...")
                        cursor.execute(f"ALTER TABLE email_tracking ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for follow_up_emails table
                cursor.execute("PRAGMA table_info(follow_up_emails)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                follow_up_emails_columns = [
                    ('follow_up_campaign_id', 'INTEGER'),
                    ('recipient_email', 'TEXT NOT NULL'),
                    ('recipient_name', 'TEXT'),
                    ('follow_up_number', 'INTEGER DEFAULT 1'),
                    ('scheduled_at', 'TIMESTAMP'),
                    ('sent_at', 'TIMESTAMP'),
                    ('status', 'TEXT DEFAULT "scheduled"'),
                    ('error_message', 'TEXT'),
                    ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
                ]
                
                for column_name, column_type in follow_up_emails_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to follow_up_emails table...")
                        cursor.execute(f"ALTER TABLE follow_up_emails ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for automated_follow_up_settings table
                cursor.execute("PRAGMA table_info(automated_follow_up_settings)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                automated_settings_columns = [
                    ('user_id', 'INTEGER UNIQUE'),
                    ('enabled', 'BOOLEAN DEFAULT 1'),
                    ('check_interval_hours', 'INTEGER DEFAULT 6'),
                    ('default_delay_days', 'INTEGER DEFAULT 3'),
                    ('max_follow_ups', 'INTEGER DEFAULT 3'),
                    ('auto_stop_after_reply', 'BOOLEAN DEFAULT 1'),
                    ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
                    ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
                ]
                
                for column_name, column_type in automated_settings_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to automated_follow_up_settings table...")
                        cursor.execute(f"ALTER TABLE automated_follow_up_settings ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                # Check and add columns for sender_accounts table
                cursor.execute("PRAGMA table_info(sender_accounts)")
                existing_columns = [column[1] for column in cursor.fetchall()]
                
                sender_accounts_columns = [
                    ('user_id', 'INTEGER'),
                    ('email', 'TEXT NOT NULL'),
                    ('password', 'TEXT NOT NULL'),
                    ('sender_name', 'TEXT'),
                    ('is_active', 'BOOLEAN DEFAULT 1'),
                    ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
                ]
                
                for column_name, column_type in sender_accounts_columns:
                    if column_name not in existing_columns:
                        print(f"Adding {column_name} column to sender_accounts table...")
                        cursor.execute(f"ALTER TABLE sender_accounts ADD COLUMN {column_name} {column_type}")
                        print(f"{column_name} column added successfully!")
                
                connection.commit()
                print("All migrations completed successfully!")
                    
            except sqlite3.Error as e:
                print(f"Error during migration: {e}")
                connection.rollback()
            finally:
                if connection:
                    connection.close()

    def get_or_create_default_user(self):
        """Get or create a default user for the application"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                cursor.execute(
                    "SELECT id FROM users WHERE username = 'default_user'"
                )
                user = cursor.fetchone()
                
                if user:
                    return user[0]
                else:
                    cursor.execute(
                        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                        ('default_user', 'default@example.com', self.hash_password('default_password'))
                    )
                    connection.commit()
                    return cursor.lastrowid
                    
            except sqlite3.Error as e:
                print(f"Error getting/creating default user: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def get_default_user_id(self):
        return self.get_or_create_default_user()
    
    def create_database_and_tables(self):
        connection = None
        try:
            connection = self.get_connection()
            cursor = connection.cursor()
            
            # Create users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    role TEXT DEFAULT 'user',  -- NEW COLUMN: 'user', 'admin', 'super_admin'
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active BOOLEAN DEFAULT 1
                )
            """)
    
            # Create email_auto_replies table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS email_auto_replies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tracking_id INTEGER,
                    auto_reply_subject TEXT NOT NULL,
                    auto_reply_body TEXT NOT NULL,
                    auto_reply_sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'sent',
                    sender_email TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (tracking_id) REFERENCES email_tracking(id) ON DELETE CASCADE
                )
            """)
            
            # Create user_sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    session_token TEXT UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create user_settings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE,
                    zoho_client_id TEXT,
                    zoho_client_secret TEXT,
                    zoho_redirect_uri TEXT,
                    zoho_access_token TEXT,
                    zoho_refresh_token TEXT,
                    email_content TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create password_reset_tokens table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    reset_token TEXT UNIQUE NOT NULL,
                    expires_at TIMESTAMP,
                    used BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create uploaded_files table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS uploaded_files (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    filename TEXT NOT NULL,
                    original_filename TEXT NOT NULL,
                    file_size INTEGER NOT NULL,
                    file_type TEXT,
                    total_records INTEGER DEFAULT 0,
                    column_count INTEGER DEFAULT 0,
                    row_count INTEGER DEFAULT 0,
                    file_data BLOB,
                    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create email_campaigns table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS email_campaigns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    file_id INTEGER,
                    campaign_name TEXT,
                    total_recipients INTEGER DEFAULT 0,
                    emails_sent INTEGER DEFAULT 0,
                    batch_size INTEGER DEFAULT 250,
                    use_templates INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (file_id) REFERENCES uploaded_files(id) ON DELETE SET NULL
                )
            """)
            
            # Create sent_emails table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sent_emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER,
                    recipient_email TEXT NOT NULL,
                    recipient_name TEXT,
                    recipient_position TEXT,
                    sender_email TEXT NOT NULL,
                    sender_name TEXT,
                    subject TEXT,
                    body TEXT,
                    template_used TEXT,
                    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'sent',
                    error_message TEXT,
                    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
                )
            """)
            
            # Create email_templates table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS email_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    position TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    sender_name TEXT,
                    is_default BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (user_id, position),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            # Create auto_reply_templates table (campaign-specific or default per user)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS auto_reply_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    -- campaign_id = 0 denotes the user's default auto-reply template
                    campaign_id INTEGER DEFAULT 0,
                    subject TEXT NOT NULL,
                    body TEXT NOT NULL,
                    is_default BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, campaign_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create email_tracking table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS email_tracking (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER,
                    recipient_email TEXT NOT NULL,
                    recipient_name TEXT,
                    sender_email TEXT,
                    sent_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'sent',
                    reply_time TIMESTAMP,
                    reply_message TEXT,
                    bounce_type TEXT,
                    bounce_reason TEXT,
                    last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
                    UNIQUE(campaign_id, recipient_email)
                )
            """)
            
            # Create follow_up_campaigns table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS follow_up_campaigns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    original_campaign_id INTEGER,
                    user_id INTEGER,
                    follow_up_name TEXT NOT NULL,
                    follow_up_subject TEXT NOT NULL,
                    follow_up_body TEXT NOT NULL,
                    sender_name TEXT,
                    delay_days INTEGER DEFAULT 3,
                    max_follow_ups INTEGER DEFAULT 3,
                    status TEXT DEFAULT 'pending',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    started_at TIMESTAMP,
                    completed_at TIMESTAMP,
                    FOREIGN KEY (original_campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create follow_up_emails table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS follow_up_emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    follow_up_campaign_id INTEGER,
                    recipient_email TEXT NOT NULL,
                    recipient_name TEXT,
                    follow_up_number INTEGER DEFAULT 1,
                    scheduled_at TIMESTAMP,
                    sent_at TIMESTAMP,
                    status TEXT DEFAULT 'scheduled',
                    error_message TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (follow_up_campaign_id) REFERENCES follow_up_campaigns(id) ON DELETE CASCADE
                )
            """)
            
            # Create automated_follow_up_settings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS automated_follow_up_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER UNIQUE,
                    enabled BOOLEAN DEFAULT 1,
                    check_interval_hours INTEGER DEFAULT 6,
                    default_delay_days INTEGER DEFAULT 3,
                    max_follow_ups INTEGER DEFAULT 3,
                    auto_stop_after_reply BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            # Create sender_accounts table for follow-up emails
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sender_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    email TEXT NOT NULL,
                    password TEXT NOT NULL,
                    sender_name TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)

            # Create replied_users table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS replied_users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    tracking_id INTEGER,
                    recipient_name TEXT,
                    recipient_email TEXT NOT NULL,
                    phone_number TEXT,
                    reply_subject TEXT,
                    reply_message TEXT,
                    reply_time TIMESTAMP,
                    added_to_zoho BOOLEAN DEFAULT 0,
                    zoho_lead_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (tracking_id) REFERENCES email_tracking(id) ON DELETE CASCADE
                )
            """)
            
            # Create modules table for role-based access control
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS modules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    module_key TEXT UNIQUE NOT NULL,
                    module_name TEXT NOT NULL,
                    description TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create user_module_permissions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_module_permissions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    module_key TEXT NOT NULL,
                    can_access BOOLEAN DEFAULT 1,
                    granted_by INTEGER,
                    granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL,
                    UNIQUE(user_id, module_key)
                )
            """)
            
            # Create user_activity_log table for super admin monitoring
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_activity_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    activity_type TEXT NOT NULL,
                    module_key TEXT,
                    description TEXT,
                    ip_address TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            """)
            
            connection.commit()
            print("Database and tables created successfully!")
            
            # Initialize default modules
            self.initialize_modules()
            
        except sqlite3.Error as e:
            print(f"Error creating database: {e}")
        finally:
            if connection:
                connection.close()
        
        # Apply migrations and create default user
        self.migrate_database()
        self.migrate_email_tracking_tables()
        default_user_id = self.get_or_create_default_user()
        if default_user_id:
            print(f"Default user created with ID: {default_user_id}")
        else:
            print("Warning: Could not create default user")


    # Add these functions to your Database class in database.py

    def create_user_with_role(self, username, email, password, role):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # Hash the password
                password_hash = self.hash_password(password)
                
                # Get current timestamp in ISO format
                current_time = datetime.now().isoformat()
                
                # Insert user with current timestamp
                cursor.execute("""
                    INSERT INTO users (username, email, password_hash, role, created_at, is_active)
                    VALUES (?, ?, ?, ?, ?, 1)
                """, (username, email, password_hash, role, current_time))
                
                connection.commit()
                return cursor.lastrowid
                
            except sqlite3.IntegrityError:
                # Username or email already exists
                return None
            except Exception as e:
                print(f"Error creating user: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None


    def get_user_count(self):
        """Get total number of users"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT COUNT(*) FROM users")
                return cursor.fetchone()[0]
            except sqlite3.Error as e:
                print(f"Error getting user count: {e}")
                return 0
            finally:
                if connection:
                    connection.close()
        return 0

    def get_all_users(self):
        """Get all users (for admin panel)"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT id, username, email, role, created_at, is_active FROM users ORDER BY created_at DESC")
                rows = cursor.fetchall()
                users = []
                for row in rows:
                    users.append({
                        "id": row[0],
                        "username": row[1],
                        "email": row[2],
                        "role": row[3],
                        "created_at": row[4],
                        "is_active": bool(row[5])
                    })
                return users
            except sqlite3.Error as e:
                print(f"Error getting all users: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def update_user_role(self, user_id, new_role):
        """Update user's role"""
        allowed_roles = ["user", "admin", "super_admin"]
        if new_role not in allowed_roles:
            return False
        
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "UPDATE users SET role = ? WHERE id = ?",
                    (new_role, user_id)
                )
                connection.commit()
                return cursor.rowcount > 0
            except sqlite3.Error as e:
                print(f"Error updating user role: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def deactivate_user(self, user_id):
        """Deactivate user (soft delete)"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "UPDATE users SET is_active = 0 WHERE id = ?",
                    (user_id,)
                )
                connection.commit()
                return cursor.rowcount > 0
            except sqlite3.Error as e:
                print(f"Error deactivating user: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False





    def hash_password(self, password):
        return hashlib.sha256(password.encode('utf-8')).hexdigest()
    
    def create_user(self, username, email, password):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                password_hash = self.hash_password(password)
                
                cursor.execute(
                    "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                    (username, email, password_hash)
                )
                connection.commit()
                user_id = cursor.lastrowid
                print(f"User created with ID: {user_id}")
                return user_id
            except sqlite3.Error as e:
                print(f"Error creating user: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None
    
    def verify_user(self, username, password):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                password_hash = self.hash_password(password)
                
                cursor.execute(
                    "SELECT * FROM users WHERE username = ? AND is_active = 1",
                    (username,)
                )
                user = cursor.fetchone()
                
                if user:
                    user_dict = dict(user)
                    if password_hash == user_dict['password_hash']:
                        return user_dict
                    
                return None
            except sqlite3.Error as e:
                print(f"Error verifying user: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None
    
    def create_session(self, user_id, session_token, expires_at):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                expires_at_str = expires_at.strftime('%Y-%m-%d %H:%M:%S')
                
                cursor.execute(
                    "INSERT INTO user_sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)",
                    (user_id, session_token, expires_at_str)
                )
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error creating session: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False
    
    # Update this function in database.py
    def get_user_by_session(self, session_token):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT u.* FROM users u 
                    JOIN user_sessions us ON u.id = us.user_id 
                    WHERE us.session_token = ? AND us.expires_at > datetime('now')
                """, (session_token,))
                user = cursor.fetchone()
                return dict(user) if user else None
            except sqlite3.Error as e:
                print(f"Error getting user by session: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None


    def delete_session(self, session_token):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("DELETE FROM user_sessions WHERE session_token = ?", (session_token,))
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error deleting session: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False
    
    def create_password_reset_token(self, user_id):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user_id,))
                
                reset_token = secrets.token_urlsafe(32)
                expires_at = datetime.now() + timedelta(hours=1)
                expires_at_str = expires_at.strftime('%Y-%m-%d %H:%M:%S')
                
                cursor.execute(
                    "INSERT INTO password_reset_tokens (user_id, reset_token, expires_at) VALUES (?, ?, ?)",
                    (user_id, reset_token, expires_at_str)
                )
                connection.commit()
                return reset_token
            except sqlite3.Error as e:
                print(f"Error creating reset token: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def get_user_by_reset_token(self, reset_token):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT u.* FROM users u 
                    JOIN password_reset_tokens prt ON u.id = prt.user_id 
                    WHERE prt.reset_token = ? AND prt.expires_at > datetime('now') AND prt.used = 0
                """, (reset_token,))
                user = cursor.fetchone()
                return dict(user) if user else None
            except sqlite3.Error as e:
                print(f"Error getting user by reset token: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def mark_reset_token_used(self, reset_token):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "UPDATE password_reset_tokens SET used = 1 WHERE reset_token = ?",
                    (reset_token,)
                )
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error marking token as used: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def get_user_by_email(self, email):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute(
                    "SELECT * FROM users WHERE email = ? AND is_active = 1",
                    (email,)
                )
                user = cursor.fetchone()
                return dict(user) if user else None
            except sqlite3.Error as e:
                print(f"Error getting user by email: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def update_user_password(self, user_id, new_password):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                password_hash = self.hash_password(new_password)
                
                cursor.execute(
                    "UPDATE users SET password_hash = ? WHERE id = ?",
                    (password_hash, user_id)
                )
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error updating password: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False
    
    def save_uploaded_file(self, user_id, filename, original_filename, file_size, file_type, total_records, column_count=0, row_count=0, file_data=None):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if not normalized_user_id:
                    print("Error: Could not get valid user ID")
                    return None
                
                if file_type and len(file_type) > 255:
                    file_type = file_type[:255]
                
                if file_type is None:
                    file_type = "unknown"
                
                cursor.execute(
                    """INSERT INTO uploaded_files 
                    (user_id, filename, original_filename, file_size, file_type, total_records, column_count, row_count) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (normalized_user_id, filename, original_filename, file_size, file_type, total_records, column_count, row_count)
                )
                
                connection.commit()
                file_id = cursor.lastrowid
                print(f"Successfully saved uploaded file with ID: {file_id}")
                return file_id
            except sqlite3.Error as e:
                print(f"Error saving uploaded file: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def create_email_campaign(self, user_id, file_id, campaign_name, total_recipients, batch_size, use_templates):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if not normalized_user_id:
                    print("Error: Could not get valid user ID")
                    return None
                
                started_at = self.get_current_timestamp()
                    
                cursor.execute(
                    """INSERT INTO email_campaigns 
                    (user_id, file_id, campaign_name, total_recipients, batch_size, use_templates, started_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (normalized_user_id, file_id, campaign_name, total_recipients, batch_size, use_templates, started_at)
                )
                connection.commit()
                campaign_id = cursor.lastrowid
                print(f"Successfully created campaign with ID: {campaign_id}, started_at: {started_at}")
                return campaign_id
            except sqlite3.Error as e:
                print(f"Error creating email campaign: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def update_campaign_status(self, campaign_id, status, emails_sent=0, user_id=None):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # If user_id is provided, verify access
                if user_id:
                    normalized_user_id = self.normalize_user_id(user_id)
                    cursor.execute("SELECT id FROM email_campaigns WHERE id = ? AND user_id = ?", 
                                 (campaign_id, normalized_user_id))
                    if not cursor.fetchone():
                        return False
                
                if status == 'completed':
                    completed_at = self.get_current_timestamp()
                    cursor.execute(
                        """UPDATE email_campaigns 
                        SET status = ?, emails_sent = ?, completed_at = ? 
                        WHERE id = ?""",
                        (status, emails_sent, completed_at, campaign_id)
                    )
                    print(f"Campaign {campaign_id} completed at: {completed_at}")
                else:
                    cursor.execute(
                        """UPDATE email_campaigns 
                        SET status = ?, emails_sent = ? 
                        WHERE id = ?""",
                        (status, emails_sent, campaign_id)
                    )
                connection.commit()
                print(f"Updated campaign {campaign_id} status to {status}, emails sent: {emails_sent}")
                return True
            except sqlite3.Error as e:
                print(f"Error updating campaign status: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def save_sent_email(self, campaign_id, recipient_email, recipient_name, recipient_position, 
                    sender_email, sender_name, subject, body, template_used, 
                    status='sent', error_message=None, provider=None):
        """Save sent email record with optional provider"""
        
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # If provider is provided, include it in the INSERT
                if provider is not None:
                    cursor.execute(
                        """INSERT INTO sent_emails 
                        (campaign_id, recipient_email, recipient_name, recipient_position, 
                        sender_email, sender_name, subject, body, template_used, 
                        status, error_message, provider) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (campaign_id, recipient_email, recipient_name, recipient_position,
                        sender_email, sender_name, subject, body, template_used, 
                        status, error_message, provider)
                    )
                else:
                    cursor.execute(
                        """INSERT INTO sent_emails 
                        (campaign_id, recipient_email, recipient_name, recipient_position, 
                        sender_email, sender_name, subject, body, template_used, 
                        status, error_message) 
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (campaign_id, recipient_email, recipient_name, recipient_position,
                        sender_email, sender_name, subject, body, template_used, 
                        status, error_message)
                    )
                
                connection.commit()
                email_id = cursor.lastrowid
                print(f"✅ Saved sent email ID: {email_id} for {recipient_email}")
                return email_id
                
            except sqlite3.Error as e:
                print(f"❌ Error saving sent email: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None


    


    def get_user_campaigns(self, user_id, limit=10):
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if not normalized_user_id:
                    return []
                    
                cursor.execute("""
                    SELECT ec.*, uf.original_filename 
                    FROM email_campaigns ec 
                    LEFT JOIN uploaded_files uf ON ec.file_id = uf.id 
                    WHERE ec.user_id = ? 
                    ORDER BY ec.created_at DESC 
                    LIMIT ?
                """, (normalized_user_id, limit))
                campaigns = cursor.fetchall()
                
                campaign_list = []
                for campaign in campaigns:
                    campaign_dict = dict(campaign)
                    if campaign_dict.get('started_at'):
                        campaign_dict['started_at_formatted'] = campaign_dict['started_at']
                    if campaign_dict.get('completed_at'):
                        campaign_dict['completed_at_formatted'] = campaign_dict['completed_at']
                    if campaign_dict.get('created_at'):
                        campaign_dict['created_at_formatted'] = campaign_dict['created_at']
                    campaign_list.append(campaign_dict)
                
                return campaign_list
            except sqlite3.Error as e:
                print(f"Error getting user campaigns: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def get_campaign_emails(self, campaign_id, user_id):
        """Get emails for a campaign with user verification"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                # Verify the campaign belongs to the user
                cursor.execute("""
                    SELECT id FROM email_campaigns 
                    WHERE id = ? AND user_id = ?
                """, (campaign_id, normalized_user_id))
                
                if not cursor.fetchone():
                    return []
                
                cursor.execute("""
                    SELECT * FROM sent_emails 
                    WHERE campaign_id = ? 
                    ORDER BY sent_at DESC
                """, (campaign_id,))
                emails = cursor.fetchall()
                return [dict(email) for email in emails]
            except sqlite3.Error as e:
                print(f"Error getting campaign emails: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []
    
    def get_campaign_email_stats(self, campaign_id, user_id):
        """Get detailed email statistics for a campaign with user verification"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                # Verify the campaign belongs to the user
                cursor.execute("""
                    SELECT id FROM email_campaigns 
                    WHERE id = ? AND user_id = ?
                """, (campaign_id, normalized_user_id))
                
                if not cursor.fetchone():
                    return {
                        "stats": {'total': 0, 'sent': 0, 'failed': 0, 'bounced': 0, 'replied': 0},
                        "no_reply_emails": [],
                        "bounced_emails": []
                    }
                
                cursor.execute("""
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
                        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                        SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                        SUM(CASE WHEN status = 'replied' THEN 1 ELSE 0 END) as replied
                    FROM sent_emails 
                    WHERE campaign_id = ?
                """, (campaign_id,))
                
                stats_row = cursor.fetchone()
                stats = dict(stats_row) if stats_row else {
                    'total': 0, 'sent': 0, 'failed': 0, 'bounced': 0, 'replied': 0
                }
                
                cursor.execute("""
                    SELECT DISTINCT recipient_email, recipient_name, recipient_position
                    FROM sent_emails 
                    WHERE campaign_id = ? 
                    AND status = 'sent'
                    AND recipient_email NOT IN (
                        SELECT recipient_email FROM sent_emails 
                        WHERE campaign_id = ? AND status = 'replied'
                    )
                    AND recipient_email NOT IN (
                        SELECT recipient_email FROM sent_emails 
                        WHERE campaign_id = ? AND status = 'bounced'
                    )
                """, (campaign_id, campaign_id, campaign_id))
                
                no_reply_emails = []
                rows = cursor.fetchall()
                for row in rows:
                    no_reply_emails.append({
                        'recipient_email': row[0],
                        'recipient_name': row[1] or '',
                        'recipient_position': row[2] or ''
                    })
                
                cursor.execute("""
                    SELECT DISTINCT recipient_email, error_message 
                    FROM sent_emails 
                    WHERE campaign_id = ? AND status = 'bounced'
                """, (campaign_id,))
                
                bounced_emails = []
                rows = cursor.fetchall()
                for row in rows:
                    bounced_emails.append({
                        'recipient_email': row[0],
                        'bounce_reason': row[1] or 'Unknown bounce reason'
                    })
                
                return {
                    "stats": stats,
                    "no_reply_emails": no_reply_emails,
                    "bounced_emails": bounced_emails
                }
                
            except Exception as e:
                print(f"Error getting campaign email stats: {e}")
                import traceback
                traceback.print_exc()
                return {
                    "stats": {'total': 0, 'sent': 0, 'failed': 0, 'bounced': 0, 'replied': 0},
                    "no_reply_emails": [],
                    "bounced_emails": []
                }
            finally:
                if connection:
                    connection.close()
        return {
            "stats": {'total': 0, 'sent': 0, 'failed': 0, 'bounced': 0, 'replied': 0},
            "no_reply_emails": [],
            "bounced_emails": []
        }
    
    def delete_file(self, file_id, user_id):
        """Delete a file from the database with user verification"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                # Verify the file belongs to the user
                cursor.execute("SELECT id FROM uploaded_files WHERE id = ? AND user_id = ?", 
                             (file_id, normalized_user_id))
                if not cursor.fetchone():
                    return False
                
                # First delete any campaigns that reference this file
                cursor.execute("DELETE FROM email_campaigns WHERE file_id = ?", (file_id,))
                
                # Then delete the file
                cursor.execute("DELETE FROM uploaded_files WHERE id = ?", (file_id,))
                
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error deleting file: {e}")
                connection.rollback()
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def check_existing_file(self, user_id, filename):
        """Check if a file with the same name already exists for the user"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if not normalized_user_id:
                    return None
                
                cursor.execute(
                    "SELECT id, original_filename, uploaded_at, total_records FROM uploaded_files WHERE user_id = ? AND original_filename = ? ORDER BY uploaded_at DESC LIMIT 1",
                    (normalized_user_id, filename)
                )
                existing_file = cursor.fetchone()
                
                return dict(existing_file) if existing_file else None
                
            except sqlite3.Error as e:
                print(f"Error checking existing file: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def migrate_email_tracking_tables(self):
        """Create tables for email tracking"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS email_tracking (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        campaign_id INTEGER,
                        recipient_email TEXT NOT NULL,
                        recipient_name TEXT,
                        sent_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        status TEXT DEFAULT 'sent',
                        reply_time TIMESTAMP,
                        reply_message TEXT,
                        bounce_reason TEXT,
                        last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
                        UNIQUE(campaign_id, recipient_email)
                    )
                """)
                
                connection.commit()
                print("Email tracking table created successfully!")
                
            except sqlite3.Error as e:
                print(f"Error creating email tracking table: {e}")
                connection.rollback()
            finally:
                if connection:
                    connection.close()

    def save_email_tracking(self, campaign_id, recipient_email, recipient_name, status='sent', sender_email=None):
        """Save or update email tracking record"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                current_time = self.get_current_timestamp()
                
                cursor.execute(
                    "SELECT id FROM email_tracking WHERE campaign_id = ? AND recipient_email = ?",
                    (campaign_id, recipient_email)
                )
                existing = cursor.fetchone()
                
                if existing:
                    cursor.execute("""
                        UPDATE email_tracking 
                        SET status = ?, updated_at = ?, last_checked = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (status, current_time, current_time, campaign_id, recipient_email))
                else:
                    cursor.execute("""
                        INSERT INTO email_tracking 
                        (campaign_id, recipient_email, recipient_name, sender_email, status, sent_time, created_at, updated_at, last_checked)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (campaign_id, recipient_email, recipient_name, sender_email, status, current_time, current_time, current_time, current_time))
                
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error saving email tracking: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def update_email_tracking_status(self, campaign_id, recipient_email, status, reply_message=None, bounce_type=None, bounce_reason=None, bounce_details=None):
        """Update email tracking status"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                current_time = self.get_current_timestamp()
                
                if status == 'replied':
                    cursor.execute("""
                        UPDATE email_tracking 
                        SET status = ?, reply_time = ?, reply_message = ?, updated_at = ?, last_checked = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (status, current_time, reply_message, current_time, current_time, campaign_id, recipient_email))
                elif status == 'bounced':
                    # Update with bounce type and reason
                    cursor.execute("""
                        UPDATE email_tracking 
                        SET status = ?, bounce_type = ?, bounce_reason = ?, updated_at = ?, last_checked = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (status, bounce_type or 'unknown', bounce_reason, current_time, current_time, campaign_id, recipient_email))
                else:
                    cursor.execute("""
                        UPDATE email_tracking 
                        SET status = ?, updated_at = ?, last_checked = ?
                        WHERE campaign_id = ? AND recipient_email = ?
                    """, (status, current_time, current_time, campaign_id, recipient_email))
                
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error updating email tracking status: {e}")
                return False
            finally:
                if connection:
                    connection.close()
    
    def insert_reply_record(self, user_id, tracking_id, recipient_email, recipient_name, reply_subject, reply_message, reply_time):
        """Insert a new reply record into replied_users table"""
        connection = self.get_connection()
        if not connection:
            return False
            
        try:
            cursor = connection.cursor()
            
            # Check if this exact reply already exists (prevent duplicates)
            cursor.execute("""
                SELECT id FROM replied_users
                WHERE tracking_id = ? 
                  AND reply_time = ?
                  AND reply_message = ?
            """, (tracking_id, reply_time, reply_message))
            
            if cursor.fetchone():
                print(f"Reply already exists for tracking_id {tracking_id} at {reply_time}")
                return True  # Already exists, not an error
            
            # Insert new reply record
            cursor.execute("""
                INSERT INTO replied_users (
                    user_id,
                    tracking_id,
                    recipient_name,
                    recipient_email,
                    reply_subject,
                    reply_message,
                    reply_time
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                tracking_id,
                recipient_name,
                recipient_email,
                reply_subject,
                reply_message,
                reply_time
            ))
            
            connection.commit()
            print(f"Inserted reply record for {recipient_email} at {reply_time}")
            return True
        except sqlite3.Error as e:
            print(f"Error inserting reply record: {e}")
            return False
        finally:
            if connection:
                connection.close()
        return False

    def get_tracking_emails(self, user_id, sender_email=None, include_all=False):
        """Get email tracking data; super admins can aggregate across all users or filter by sender_email (which means the user who created the campaign)."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)

                base_query = """
                    SELECT 
                        et.*, 
                        ec.campaign_name, 
                        ec.user_id, 
                        COALESCE(se.sender_email, et.sender_email) AS sender_email
                    FROM email_tracking et
                    LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                    LEFT JOIN sent_emails se 
                        ON et.campaign_id = se.campaign_id 
                        AND et.recipient_email = se.recipient_email
                """

                where_clauses = []
                params = []

                if not include_all:
                    where_clauses.append("ec.user_id = ?")
                    params.append(normalized_user_id)
                elif sender_email and sender_email != 'all':
                    # For superadmin filtering by sender_email: find user by email and filter by their campaigns
                    # First find the user_id that has this email
                    user_cursor = connection.cursor()
                    user_cursor.execute("SELECT id FROM users WHERE email = ?", (sender_email,))
                    user_row = user_cursor.fetchone()
                    if user_row:
                        filter_user_id = user_row['id']
                        where_clauses.append("ec.user_id = ?")
                        params.append(filter_user_id)
                    else:
                        # No user found with this email
                        return []

                where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
                query = f"{base_query} WHERE {where_sql} ORDER BY et.sent_time DESC"

                cursor.execute(query, tuple(params))
                tracking_data = cursor.fetchall()
                return [dict(row) for row in tracking_data]
            except sqlite3.Error as e:
                print(f"Error getting tracking emails: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []
    
    def get_campaigns_with_tracking(self, user_id, sender_email=None, include_all=False):
        """Get campaigns with tracking data; super admins can view all."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if not normalized_user_id:
                    return []

                base_query = """
                    SELECT 
                        ec.id as campaign_id,
                        ec.user_id,
                        ec.campaign_name,
                        ec.total_recipients,
                        ec.emails_sent,
                        ec.status,
                        ec.started_at,
                        uf.original_filename,
                        uf.uploaded_at,
                        COUNT(et.id) as tracked_emails,
                        SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                        SUM(CASE WHEN et.status IN ('replied', 'auto_reply') THEN 1 ELSE 0 END) as inbox_count,
                        COUNT(DISTINCT CASE WHEN ear.id IS NOT NULL AND ear.status = 'sent' THEN ear.id END) as replied_count,
                        SUM(CASE WHEN et.status = 'bounced' THEN 1 ELSE 0 END) as bounced_count,
                        SUM(CASE WHEN et.status = 'no_reply' THEN 1 ELSE 0 END) as no_reply_count,
                        CASE WHEN EXISTS (
                            SELECT 1 FROM auto_reply_templates art
                            WHERE art.user_id = ec.user_id AND art.campaign_id = ec.id
                        ) THEN 1 ELSE 0 END AS has_auto_reply_template
                    FROM email_campaigns ec
                    LEFT JOIN uploaded_files uf ON ec.file_id = uf.id
                    LEFT JOIN email_tracking et ON ec.id = et.campaign_id
                    LEFT JOIN sent_emails se 
                        ON et.campaign_id = se.campaign_id 
                        AND et.recipient_email = se.recipient_email
                    LEFT JOIN email_auto_replies ear ON et.id = ear.tracking_id
                """

                where_clauses = []
                params = []

                if not include_all:
                    where_clauses.append("ec.user_id = ?")
                    params.append(normalized_user_id)

                if sender_email:
                    where_clauses.append("COALESCE(se.sender_email, et.sender_email) = ?")
                    params.append(sender_email)

                where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
                query = f"{base_query} WHERE {where_sql}\n                    GROUP BY ec.id\n                    ORDER BY ec.started_at DESC"

                cursor.execute(query, tuple(params))
                campaigns = cursor.fetchall()
                return [dict(campaign) for campaign in campaigns]
                
            except sqlite3.Error as e:
                print(f"Error getting campaigns with tracking: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def get_auto_reply_template_for_campaign(self, user_id, campaign_id):
        """Return the campaign-specific auto-reply template if set; otherwise None."""
        connection = self.get_connection()
        if not connection:
            return None
        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT subject, body, is_default
                FROM auto_reply_templates
                WHERE user_id = ? AND campaign_id = ?
                LIMIT 1
                """,
                (self.normalize_user_id(user_id), campaign_id or 0)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        except sqlite3.Error as e:
            print(f"Error fetching auto-reply template for campaign: {e}")
            return None
        finally:
            connection.close()

    def get_default_auto_reply_template(self, user_id):
        """Return the user's default auto-reply template (campaign_id = 0) if set; else None."""
        connection = self.get_connection()
        if not connection:
            return None
        try:
            cursor = connection.cursor()
            cursor.execute(
                """
                SELECT subject, body, is_default
                FROM auto_reply_templates
                WHERE user_id = ? AND campaign_id = 0
                LIMIT 1
                """,
                (self.normalize_user_id(user_id),)
            )
            row = cursor.fetchone()
            return dict(row) if row else None
        except sqlite3.Error as e:
            print(f"Error fetching default auto-reply template: {e}")
            return None
        finally:
            connection.close()

    def upsert_auto_reply_template(self, user_id, subject, body, campaign_id=None, is_default=False):
        """Create or update an auto-reply template for a campaign or default (campaign_id=0)."""
        connection = self.get_connection()
        if not connection:
            return False
        try:
            cursor = connection.cursor()
            cid = 0 if (campaign_id is None or is_default) else int(campaign_id)
            cursor.execute(
                """
                INSERT INTO auto_reply_templates (user_id, campaign_id, subject, body, is_default)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, campaign_id)
                DO UPDATE SET subject = excluded.subject,
                              body = excluded.body,
                              is_default = excluded.is_default,
                              updated_at = CURRENT_TIMESTAMP
                """,
                (self.normalize_user_id(user_id), cid, subject, body, 1 if is_default or cid == 0 else 0)
            )
            connection.commit()
            return True
        except sqlite3.Error as e:
            print(f"Error upserting auto-reply template: {e}")
            return False
        finally:
            connection.close()

    def get_tracking_stats(self, user_id, sender_email=None, include_all=False):
        """Get email tracking statistics; super admins can aggregate across all users."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                base_query = """
                    SELECT 
                        COUNT(*) as total,
                        SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent,
                        SUM(CASE WHEN et.status = 'replied' THEN 1 ELSE 0 END) as replied,
                        SUM(CASE WHEN et.status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                        SUM(CASE WHEN et.status = 'no_reply' THEN 1 ELSE 0 END) as no_reply
                    FROM email_tracking et
                    LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                    LEFT JOIN sent_emails se 
                        ON et.campaign_id = se.campaign_id 
                        AND et.recipient_email = se.recipient_email
                """

                where_clauses = []
                params = []

                if not include_all:
                    where_clauses.append("ec.user_id = ?")
                    params.append(normalized_user_id)

                if sender_email:
                    where_clauses.append("COALESCE(se.sender_email, et.sender_email) = ?")
                    params.append(sender_email)

                where_sql = " AND ".join(where_clauses) if where_clauses else "1=1"
                query = f"{base_query} WHERE {where_sql}"

                cursor.execute(query, tuple(params))
                stats_row = cursor.fetchone()
                return dict(stats_row) if stats_row else {
                    'total': 0, 'sent': 0, 'replied': 0, 'bounced': 0, 'no_reply': 0
                }
            except sqlite3.Error as e:
                print(f"Error getting tracking stats: {e}")
                return {'total': 0, 'sent': 0, 'replied': 0, 'bounced': 0, 'no_reply': 0}
            finally:
                if connection:
                    connection.close()
        return {'total': 0, 'sent': 0, 'replied': 0, 'bounced': 0, 'no_reply': 0}

    def get_daily_email_stats(self, user_id, date_str, sender_email=None):
        """Get aggregated stats for a specific day."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)

                query = """
                    SELECT 
                        SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent,
                        SUM(CASE WHEN et.status = 'replied' THEN 1 ELSE 0 END) as replied,
                        SUM(CASE WHEN et.status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                        SUM(CASE WHEN et.status = 'no_reply' THEN 1 ELSE 0 END) as no_reply
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    LEFT JOIN sent_emails se 
                        ON et.campaign_id = se.campaign_id 
                        AND et.recipient_email = se.recipient_email
                    WHERE ec.user_id = ? AND date(et.sent_time) = ?
                """
                params = [normalized_user_id, date_str]

                if sender_email:
                    query += " AND se.sender_email = ?"
                    params.append(sender_email)

                cursor.execute(query, tuple(params))
                row = cursor.fetchone()
                if row:
                    sent = row['sent'] or 0
                    bounced = row['bounced'] or 0
                    replied = row['replied'] or 0
                    no_reply = row['no_reply'] or 0
                else:
                    sent = bounced = replied = no_reply = 0
                delivered = max(sent - bounced, 0)

                return {
                    'sent': sent,
                    'delivered': delivered,
                    'replied': replied,
                    'bounced': bounced,
                    'no_reply': no_reply
                }
            except sqlite3.Error as e:
                print(f"Error getting daily email stats: {e}")
                return {'sent': 0, 'delivered': 0, 'replied': 0, 'bounced': 0, 'no_reply': 0}
            finally:
                if connection:
                    connection.close()
        return {'sent': 0, 'delivered': 0, 'replied': 0, 'bounced': 0, 'no_reply': 0}

    def get_historical_email_stats(self, user_id, days=7, sender_email=None, include_all=False):
        """Get per-day stats for the last N days (inclusive of today). Superadmin can see all users' data."""
        try:
            days = int(days)
        except (TypeError, ValueError):
            days = 7

        start_date = (datetime.now() - timedelta(days=days - 1)).date()
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)

                base_query = """
                    SELECT 
                        date(et.sent_time) as date,
                        SUM(CASE WHEN et.status = 'sent' THEN 1 ELSE 0 END) as sent,
                        SUM(CASE WHEN et.status = 'replied' THEN 1 ELSE 0 END) as replied,
                        SUM(CASE WHEN et.status = 'bounced' THEN 1 ELSE 0 END) as bounced,
                        SUM(CASE WHEN et.status = 'no_reply' THEN 1 ELSE 0 END) as no_reply
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    LEFT JOIN sent_emails se 
                        ON et.campaign_id = se.campaign_id 
                        AND et.recipient_email = se.recipient_email
                    WHERE date(et.sent_time) >= ?
                """
                params = [start_date.strftime('%Y-%m-%d')]

                # Add user filter for non-superadmin
                if not include_all:
                    base_query = base_query.replace("WHERE date(et.sent_time) >= ?", "WHERE ec.user_id = ? AND date(et.sent_time) >= ?")
                    params.insert(0, normalized_user_id)
                elif sender_email and sender_email != 'all':
                    # For superadmin filtering by sender_email: find user by email
                    user_cursor = connection.cursor()
                    user_cursor.execute("SELECT id FROM users WHERE email = ?", (sender_email,))
                    user_row = user_cursor.fetchone()
                    if user_row:
                        filter_user_id = user_row['id']
                        base_query = base_query.replace("WHERE date(et.sent_time) >= ?", "WHERE ec.user_id = ? AND date(et.sent_time) >= ?")
                        params.insert(0, filter_user_id)
                    else:
                        # No user found with this email
                        return []

                query = base_query + " GROUP BY date(et.sent_time) ORDER BY date(et.sent_time) ASC"

                cursor.execute(query, tuple(params))
                rows = cursor.fetchall() or []

                # Seed with zeroed days to ensure continuity
                results_by_date = {
                    row['date']: {
                        'date': row['date'],
                        'display_date': row['date'],
                        'sent': row['sent'] or 0,
                        'replied': row['replied'] or 0,
                        'bounced': row['bounced'] or 0,
                        'no_reply': row['no_reply'] or 0
                    }
                    for row in rows
                }

                series = []
                for i in range(days):
                    day = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
                    day_entry = results_by_date.get(day, {
                        'date': day,
                        'display_date': day,
                        'sent': 0,
                        'replied': 0,
                        'bounced': 0,
                        'no_reply': 0
                    })
                    delivered = max(day_entry['sent'] - day_entry['bounced'], 0)
                    day_entry['delivered'] = delivered
                    series.append(day_entry)

                return series
            except sqlite3.Error as e:
                print(f"Error getting historical email stats: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def get_dashboard_stats_by_date(self, user_id, start_date, end_date, sender_email=None, include_all=False):
        """Get dashboard stats; super admins can aggregate across all users."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)

                date_filter = "date(et.sent_time) BETWEEN date(?) AND date(?)"

                where_clauses = [date_filter]
                params = [start_date, end_date]

                if not include_all:
                    where_clauses.insert(0, "ec.user_id = ?")
                    params.insert(0, normalized_user_id)

                if sender_email and sender_email != 'all':
                    where_clauses.append("COALESCE(et.sender_email, se.sender_email) = ?")
                    params.append(sender_email)

                where_sql = " AND ".join(where_clauses)

                query = f"""
                    SELECT 
                        SUM(CASE WHEN et.status != 'ready' THEN 1 ELSE 0 END) as total_sent,
                        SUM(CASE WHEN LOWER(et.status) = 'replied' THEN 1 ELSE 0 END) as replied,
                        SUM(CASE WHEN LOWER(et.status) = 'bounced' THEN 1 ELSE 0 END) as bounced,
                        SUM(CASE WHEN LOWER(et.status) IN ('auto_reply', 'auto-reply') THEN 1 ELSE 0 END) as auto_reply,
                        SUM(CASE WHEN LOWER(et.status) IN ('sent', 'no_reply', 'delivered', 'no-reply') AND LOWER(et.status) NOT IN ('replied', 'bounced') THEN 1 ELSE 0 END) as pending
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    WHERE {where_sql}
                """

                cursor.execute(query, params)
                row = cursor.fetchone()

                campaign_query = f"""
                    SELECT COUNT(DISTINCT ec.id)
                    FROM email_campaigns ec
                    JOIN email_tracking et ON ec.id = et.campaign_id
                    WHERE {where_sql}
                """
                cursor.execute(campaign_query, params)
                campaign_count_row = cursor.fetchone()
                campaign_count = (campaign_count_row[0] if campaign_count_row else 0) or 0

                if row:
                    return {
                        "sent": row[0] or 0,
                        "replied": row[1] or 0,
                        "bounced": row[2] or 0,
                        "auto_reply": row[3] or 0,
                        "no_reply": row[4] or 0,
                        "total_campaigns": campaign_count
                    }
                return {"sent": 0, "replied": 0, "bounced": 0, "auto_reply": 0, "no_reply": 0, "total_campaigns": 0}

            except sqlite3.Error as e:
                print(f"Error getting dashboard stats: {e}")
                return None
            finally:
                connection.close()
        return None

    def get_dashboard_histogram_by_date(self, user_id, start_date, end_date, sender_email=None, include_all=False):
        """Get histogram data; super admins can aggregate across all users or filter by sender_email (campaign owner)."""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)

                where_clauses = ["et.status != 'ready'", "date(et.sent_time) BETWEEN date(?) AND date(?)"]
                params = [start_date, end_date]

                if not include_all:
                    where_clauses.insert(0, "ec.user_id = ?")
                    params.insert(0, normalized_user_id)
                elif sender_email and sender_email != 'all':
                    # For superadmin filtering by sender_email: find user by email and filter by their campaigns
                    user_cursor = connection.cursor()
                    user_cursor.execute("SELECT id FROM users WHERE email = ?", (sender_email,))
                    user_row = user_cursor.fetchone()
                    if user_row:
                        filter_user_id = user_row['id']
                        where_clauses.insert(0, "ec.user_id = ?")
                        params.insert(0, filter_user_id)
                    else:
                        # No user found with this email, return empty result
                        return None

                where_sql = " AND ".join(where_clauses)

                query = f"""
                    SELECT 
                        date(et.sent_time) as sent_date,
                        et.status,
                        COUNT(*) as count
                    FROM email_tracking et
                    JOIN email_campaigns ec ON et.campaign_id = ec.id
                    WHERE {where_sql}
                    GROUP BY sent_date, et.status
                    ORDER BY sent_date ASC
                """

                cursor.execute(query, params)
                rows = cursor.fetchall()

                # Process into time-series format
                daily_data = {}
                for row in rows:
                    d = row[0]
                    status = (row[1].lower().replace(' ', '_').replace('-', '_') if row[1] else 'unknown')
                    count = row[2]

                    if d not in daily_data:
                        daily_data[d] = {"date": d, "sent": 0, "replied": 0, "bounced": 0, "auto_reply": 0, "no_reply": 0, "ready": 0}

                    if status in daily_data[d]:
                        daily_data[d][status] = daily_data[d].get(status, 0) + count
                    else:
                        # Fallback for unknown statuses
                        daily_data[d]["sent"] = daily_data[d].get("sent", 0) + count

                result_list = sorted(daily_data.values(), key=lambda x: x['date'])

                return {
                    "history": result_list,
                    "total_days": len(result_list)
                }

            except sqlite3.Error as e:
                print(f"Error getting dashboard histogram: {e}")
                return None
            finally:
                connection.close()
        return None

    def get_automated_follow_up_settings(self, user_id):
        """Get automated follow-up settings for a user"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute(
                    "SELECT * FROM automated_follow_up_settings WHERE user_id = ?",
                    (normalized_user_id,)
                )
                settings = cursor.fetchone()
                
                if settings:
                    return dict(settings)
                else:
                    return {
                        'enabled': True,
                        'check_interval_hours': 6,
                        'default_delay_days': 3,
                        'max_follow_ups': 3,
                        'auto_stop_after_reply': True
                    }
            except sqlite3.Error as e:
                print(f"Error getting automated follow-up settings: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def update_automated_follow_up_settings(self, user_id, settings):
        """Update automated follow-up settings"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute(
                    "SELECT id FROM automated_follow_up_settings WHERE user_id = ?",
                    (normalized_user_id,)
                )
                existing = cursor.fetchone()
                
                current_time = self.get_current_timestamp()
                
                if existing:
                    cursor.execute("""
                        UPDATE automated_follow_up_settings 
                        SET enabled = ?, check_interval_hours = ?, default_delay_days = ?, 
                            max_follow_ups = ?, auto_stop_after_reply = ?, updated_at = ?
                        WHERE user_id = ?
                    """, (
                        settings.get('enabled', True),
                        settings.get('check_interval_hours', 6),
                        settings.get('default_delay_days', 3),
                        settings.get('max_follow_ups', 3),
                        settings.get('auto_stop_after_reply', True),
                        current_time,
                        normalized_user_id
                    ))
                else:
                    cursor.execute("""
                        INSERT INTO automated_follow_up_settings 
                        (user_id, enabled, check_interval_hours, default_delay_days, max_follow_ups, auto_stop_after_reply)
                        VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        normalized_user_id,
                        settings.get('enabled', True),
                        settings.get('check_interval_hours', 6),
                        settings.get('default_delay_days', 3),
                        settings.get('max_follow_ups', 3),
                        settings.get('auto_stop_after_reply', True)
                    ))
                
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error updating automated follow-up settings: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def get_sender_accounts(self, user_id):
        """Get all sender accounts for a user"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute(
                    """SELECT id, email, password, sender_name, is_active, created_at 
                       FROM sender_accounts WHERE user_id = ? ORDER BY created_at DESC""",
                    (normalized_user_id,)
                )
                accounts = cursor.fetchall()
                
                if accounts:
                    return [dict(account) for account in accounts]
                else:
                    return []
            except sqlite3.Error as e:
                print(f"Error getting sender accounts: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def get_user_settings(self, user_id):
        """Get user settings"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute(
                    """SELECT batch_size, zoho_client_id, zoho_access_token 
                       FROM user_settings WHERE user_id = ?""",
                    (normalized_user_id,)
                )
                settings = cursor.fetchone()
                
                if settings:
                    return dict(settings)
                else:
                    return {
                        "batch_size": 250,
                        "zoho_client_id": None,
                        "zoho_access_token": None
                    }
            except sqlite3.Error as e:
                print(f"Error getting user settings: {e}")
                return {
                    "batch_size": 250,
                    "zoho_client_id": None,
                    "zoho_access_token": None
                }
            finally:
                if connection:
                    connection.close()
        return {
            "batch_size": 250,
            "zoho_client_id": None,
            "zoho_access_token": None
        }

    def get_emails_for_follow_up(self, campaign_id=None, user_id="default_user"):
        """Get emails that need follow-up"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                if campaign_id:
                    query = """
                        SELECT 
                            et.recipient_email,
                            et.recipient_name,
                            et.campaign_id,
                            ec.campaign_name,
                            et.sent_time,
                            COUNT(fe.id) as follow_up_count
                        FROM email_tracking et
                        LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                        LEFT JOIN follow_up_emails fe ON et.recipient_email = fe.recipient_email 
                            AND fe.follow_up_campaign_id IN (
                                SELECT id FROM follow_up_campaigns 
                                WHERE original_campaign_id = et.campaign_id
                            )
                        WHERE et.campaign_id = ? 
                        AND et.status = 'no_reply'
                        AND ec.user_id = ?
                        GROUP BY et.recipient_email
                        HAVING follow_up_count < 3
                        ORDER BY et.sent_time ASC
                    """
                    params = (campaign_id, normalized_user_id)
                else:
                    query = """
                        SELECT 
                            et.recipient_email,
                            et.recipient_name,
                            et.campaign_id,
                            ec.campaign_name,
                            et.sent_time,
                            COUNT(fe.id) as follow_up_count
                        FROM email_tracking et
                        LEFT JOIN email_campaigns ec ON et.campaign_id = ec.id
                        LEFT JOIN follow_up_emails fe ON et.recipient_email = fe.recipient_email 
                            AND fe.follow_up_campaign_id IN (
                                SELECT id FROM follow_up_campaigns 
                                WHERE original_campaign_id = et.campaign_id
                            )
                        WHERE et.status = 'no_reply'
                        AND ec.user_id = ?
                        GROUP BY et.recipient_email
                        HAVING follow_up_count < 3
                        ORDER BY et.sent_time ASC
                    """
                    params = (normalized_user_id,)
                
                cursor.execute(query, params)
                emails = cursor.fetchall()
                return [dict(email) for email in emails]
                
            except sqlite3.Error as e:
                print(f"Error getting emails for follow-up: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def create_follow_up_campaign(self, original_campaign_id, user_id, follow_up_data):
        """Create a new follow-up campaign"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute("""
                    INSERT INTO follow_up_campaigns 
                    (original_campaign_id, user_id, follow_up_name, follow_up_subject, 
                     follow_up_body, sender_name, delay_days, max_follow_ups, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')
                """, (
                    original_campaign_id,
                    normalized_user_id,
                    follow_up_data.get('name', f"Follow-up for Campaign {original_campaign_id}"),
                    follow_up_data['subject'],
                    follow_up_data['body'],
                    follow_up_data.get('sender_name', ''),
                    follow_up_data.get('delay_days', 3),
                    follow_up_data.get('max_follow_ups', 3)
                ))
                
                follow_up_campaign_id = cursor.lastrowid
                connection.commit()
                return follow_up_campaign_id
                
            except sqlite3.Error as e:
                print(f"Error creating follow-up campaign: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def schedule_follow_up_email(self, follow_up_campaign_id, recipient_email, recipient_name, follow_up_number=1):
        """Schedule a follow-up email"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                scheduled_time = (datetime.now() + timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S')
                
                cursor.execute("""
                    INSERT INTO follow_up_emails 
                    (follow_up_campaign_id, recipient_email, recipient_name, 
                     follow_up_number, scheduled_at, status)
                    VALUES (?, ?, ?, ?, ?, 'scheduled')
                """, (
                    follow_up_campaign_id,
                    recipient_email,
                    recipient_name,
                    follow_up_number,
                    scheduled_time
                ))
                
                connection.commit()
                return cursor.lastrowid
                
            except sqlite3.Error as e:
                print(f"Error scheduling follow-up email: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def get_follow_up_campaigns(self, user_id):
        """Get all follow-up campaigns for a user"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                cursor.execute("""
                    SELECT 
                        fc.*,
                        ec.campaign_name as original_campaign_name,
                        COUNT(fe.id) as total_follow_ups,
                        SUM(CASE WHEN fe.status = 'sent' THEN 1 ELSE 0 END) as sent_count,
                        SUM(CASE WHEN fe.status = 'failed' THEN 1 ELSE 0 END) as failed_count
                    FROM follow_up_campaigns fc
                    LEFT JOIN email_campaigns ec ON fc.original_campaign_id = ec.id
                    LEFT JOIN follow_up_emails fe ON fc.id = fe.follow_up_campaign_id
                    WHERE fc.user_id = ?
                    GROUP BY fc.id
                    ORDER BY fc.created_at DESC
                """, (normalized_user_id,))
                
                campaigns = cursor.fetchall()
                return [dict(camp) for camp in campaigns]
                
            except sqlite3.Error as e:
                print(f"Error getting follow-up campaigns: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def delete_campaign(self, campaign_id, user_id):
        """Delete a campaign and its associated emails with user verification"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                normalized_user_id = self.normalize_user_id(user_id)
                
                # Verify the campaign belongs to the user
                cursor.execute("SELECT id FROM email_campaigns WHERE id = ? AND user_id = ?", 
                             (campaign_id, normalized_user_id))
                if not cursor.fetchone():
                    return False
                
                # Delete associated sent emails first
                cursor.execute("DELETE FROM sent_emails WHERE campaign_id = ?", (campaign_id,))
                
                # Delete the campaign
                cursor.execute("DELETE FROM email_campaigns WHERE id = ?", (campaign_id,))
                
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error deleting campaign: {e}")
                connection.rollback()
                return False
            finally:
                if connection:
                    connection.close()
        return False

    # RBAC Methods
    def initialize_modules(self):
        """Initialize default modules in the database"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                modules = [
                    ('dashboard', 'Dashboard', 'Summary intelligence dashboard'),
                    ('webscraping', 'Web Scraping', 'Lead generation and web scraping tools'),
                    ('worldwide_event_scraper', 'Worldwide Event Scraper', 'Discover events and extract attendee contacts worldwide'),
                    ('email_campaigns', 'Email Campaigns', 'Automated email campaign management'),
                    ('email_tracking', 'Email Tracking', 'Track email opens, clicks, and replies'),
                    ('email_validator', 'Email Validator', 'Validate and enhance email lists'),
                    ('google_scraper', 'Google Scraper', 'Google search results scraping'),
                    ('zoho_crm', 'Zoho CRM', 'Zoho CRM integration'),
                    ('admin_panel', 'Admin Panel', 'User and system administration')
                ]
                
                for module_key, module_name, description in modules:
                    cursor.execute("""
                        INSERT OR IGNORE INTO modules (module_key, module_name, description)
                        VALUES (?, ?, ?)
                    """, (module_key, module_name, description))
                
                connection.commit()
                print("Modules initialized successfully!")
            except sqlite3.Error as e:
                print(f"Error initializing modules: {e}")
            finally:
                if connection:
                    connection.close()

    def get_all_modules(self):
        """Get all available modules"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT * FROM modules ORDER BY module_name")
                modules = cursor.fetchall()
                return [dict(row) for row in modules] if modules else []
            except sqlite3.Error as e:
                print(f"Error getting modules: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def get_user_by_id(self, user_id):
        """Get user details by ID"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                user = cursor.fetchone()
                return dict(user) if user else None
            except sqlite3.Error as e:
                print(f"Error getting user: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def get_all_users_with_permissions(self):
        """Get all users with their permissions (super admin only)"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    SELECT 
                        u.id, u.username, u.email, u.role, u.is_active, u.created_at,
                        GROUP_CONCAT(ump.module_key || ':' || ump.can_access) as permissions
                    FROM users u
                    LEFT JOIN user_module_permissions ump ON u.id = ump.user_id
                    GROUP BY u.id
                    ORDER BY u.created_at DESC
                """)
                users = cursor.fetchall()
                
                result = []
                for user in users:
                    user_dict = dict(user)
                    # Parse permissions
                    if user_dict['permissions']:
                        perms = {}
                        for perm in user_dict['permissions'].split(','):
                            key, value = perm.split(':')
                            perms[key] = value == '1'
                        user_dict['permissions'] = perms
                    else:
                        user_dict['permissions'] = {}
                    result.append(user_dict)
                
                return result
            except sqlite3.Error as e:
                print(f"Error getting users: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def update_user_role(self, user_id, new_role):
        """Update user's role"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("UPDATE users SET role = ? WHERE id = ?", (new_role, user_id))
                connection.commit()
                return cursor.rowcount > 0
            except sqlite3.Error as e:
                print(f"Error updating user role: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def count_super_admins(self):
        """Count total super admins"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("SELECT COUNT(*) FROM users WHERE role = 'super_admin'")
                count = cursor.fetchone()[0]
                return count
            except sqlite3.Error as e:
                print(f"Error counting super admins: {e}")
                return 0
            finally:
                if connection:
                    connection.close()
        return 0

    def get_user_permissions(self, user_id):
        """Get user's module permissions"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # Check if user is super admin
                cursor.execute("SELECT role FROM users WHERE id = ?", (user_id,))
                user = cursor.fetchone()
                
                if user and user['role'] == 'super_admin':
                    # Super admin has access to all modules
                    cursor.execute("SELECT module_key FROM modules")
                    modules = cursor.fetchall()
                    return {row['module_key']: True for row in modules}
                
                # Get ALL modules first
                cursor.execute("SELECT module_key FROM modules")
                all_modules = cursor.fetchall()
                
                # Get user-specific permissions
                cursor.execute("""
                    SELECT module_key, can_access
                    FROM user_module_permissions
                    WHERE user_id = ?
                """, (user_id,))
                user_perms = cursor.fetchall()
                user_perms_dict = {row['module_key']: bool(row['can_access']) for row in user_perms}
                
                # Build complete permissions object: set modules to their explicit permission, 
                # or False if not explicitly set (user needs admin to grant access)
                permissions = {}
                for module in all_modules:
                    module_key = module['module_key']
                    # Only include True if explicitly set; otherwise False
                    permissions[module_key] = user_perms_dict.get(module_key, False)
                
                return permissions
            except sqlite3.Error as e:
                print(f"Error getting user permissions: {e}")
                return {}
            finally:
                if connection:
                    connection.close()
        return {}

    def set_user_permission(self, user_id, module_key, can_access, granted_by):
        """Set user's permission for a specific module"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("""
                    INSERT OR REPLACE INTO user_module_permissions 
                    (user_id, module_key, can_access, granted_by, granted_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                """, (user_id, module_key, can_access, granted_by))
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error setting user permission: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def log_activity(self, user_id, activity_type, module_key, description, ip_address=None, target_user_id=None, old_value=None, new_value=None):
        """Log user activity with detailed information"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                # Check if columns exist, if not add them
                cursor.execute("PRAGMA table_info(user_activity_log)")
                columns = [col[1] for col in cursor.fetchall()]
                
                if 'target_user_id' not in columns:
                    cursor.execute("ALTER TABLE user_activity_log ADD COLUMN target_user_id INTEGER")
                if 'old_value' not in columns:
                    cursor.execute("ALTER TABLE user_activity_log ADD COLUMN old_value TEXT")
                if 'new_value' not in columns:
                    cursor.execute("ALTER TABLE user_activity_log ADD COLUMN new_value TEXT")
                
                cursor.execute("""
                    INSERT INTO user_activity_log 
                    (user_id, activity_type, module_key, description, ip_address, target_user_id, old_value, new_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (user_id, activity_type, module_key, description, ip_address, target_user_id, old_value, new_value))
                connection.commit()
                return cursor.lastrowid
            except sqlite3.Error as e:
                print(f"Error logging activity: {e}")
                return None
            finally:
                if connection:
                    connection.close()
        return None

    def get_activity_log(self, limit=100, user_id=None):
        """Get activity log with detailed information"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                if user_id:
                    cursor.execute("""
                        SELECT 
                            ual.*,
                            u.username as actor_username,
                            u.email as actor_email,
                            target.username as target_username,
                            target.email as target_email
                        FROM user_activity_log ual
                        JOIN users u ON ual.user_id = u.id
                        LEFT JOIN users target ON ual.target_user_id = target.id
                        WHERE ual.user_id = ?
                        ORDER BY ual.created_at DESC
                        LIMIT ?
                    """, (user_id, limit))
                else:
                    cursor.execute("""
                        SELECT 
                            ual.*,
                            u.username as actor_username,
                            u.email as actor_email,
                            target.username as target_username,
                            target.email as target_email
                        FROM user_activity_log ual
                        JOIN users u ON ual.user_id = u.id
                        LEFT JOIN users target ON ual.target_user_id = target.id
                        ORDER BY ual.created_at DESC
                        LIMIT ?
                    """, (limit,))
                
                logs = cursor.fetchall()
                return [dict(row) for row in logs] if logs else []
            except sqlite3.Error as e:
                print(f"Error getting activity log: {e}")
                return []
            finally:
                if connection:
                    connection.close()
        return []

    def update_user_status(self, user_id, is_active):
        """Activate or deactivate user account"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("UPDATE users SET is_active = ? WHERE id = ?", (is_active, user_id))
                connection.commit()
                return cursor.rowcount > 0
            except sqlite3.Error as e:
                print(f"Error updating user status: {e}")
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def delete_user(self, user_id):
        """Delete a user and all associated data (super admin only)"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                
                # Delete user's permissions
                cursor.execute("DELETE FROM user_module_permissions WHERE user_id = ?", (user_id,))
                
                # Delete user's activity logs
                cursor.execute("DELETE FROM user_activity_log WHERE user_id = ?", (user_id,))
                
                # Delete user's sessions
                cursor.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
                
                # Delete the user
                cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
                
                connection.commit()
                return cursor.rowcount > 0
            except sqlite3.Error as e:
                print(f"Error deleting user: {e}")
                connection.rollback()
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def clear_activity_logs(self):
        """Clear all activity logs (super admin only)"""
        connection = self.get_connection()
        if connection:
            try:
                cursor = connection.cursor()
                cursor.execute("DELETE FROM user_activity_log")
                connection.commit()
                return True
            except sqlite3.Error as e:
                print(f"Error clearing activity logs: {e}")
                connection.rollback()
                return False
            finally:
                if connection:
                    connection.close()
        return False

    def get_nested_campaign_history(self, user_id, is_superadmin=False):
        """Get all campaigns with nested sender accounts and recipients"""
        connection = self.get_connection()
        if not connection:
            return []
            
        try:
            cursor = connection.cursor()
            normalized_user_id = self.normalize_user_id(user_id)
            
            if not normalized_user_id and not is_superadmin:
                return []
            
            # Fetch campaigns with basic stats using correlated subqueries to avoid join multiplication
            # Superadmin sees all campaigns, regular users see only their own
            if is_superadmin:
                cursor.execute("""
                    SELECT 
                        ec.id AS campaignId,
                        ec.campaign_name AS campaignName,
                        ec.status,
                        uf.original_filename AS fileName,
                        ec.started_at AS dateTime,
                        ec.user_id AS userId,
                        u.username AS userName,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'replied') AS repliedCount,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'bounced') AS bouncedCount,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'failed') AS failedCount
                    FROM email_campaigns ec
                    LEFT JOIN uploaded_files uf ON ec.file_id = uf.id
                    LEFT JOIN users u ON ec.user_id = u.id
                    ORDER BY ec.started_at DESC
                """)
            else:
                cursor.execute("""
                    SELECT 
                        ec.id AS campaignId,
                        ec.campaign_name AS campaignName,
                        ec.status,
                        uf.original_filename AS fileName,
                        ec.started_at AS dateTime,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'replied') AS repliedCount,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'bounced') AS bouncedCount,
                        (SELECT COUNT(*) FROM email_tracking et WHERE et.campaign_id = ec.id AND et.status = 'failed') AS failedCount
                    FROM email_campaigns ec
                    LEFT JOIN uploaded_files uf ON ec.file_id = uf.id
                    WHERE ec.user_id = ?
                    ORDER BY ec.started_at DESC
                """, (normalized_user_id,))
            
            campaigns = [dict(row) for row in cursor.fetchall()]
            
            for campaign in campaigns:
                # Map status to display format
                status = campaign.get('status', 'pending')
                if status == 'completed':
                    campaign['status'] = 'Completed'
                elif status == 'failed':
                    campaign['status'] = 'Failed'
                elif status in ['running', 'pending']:
                    campaign['status'] = 'Pending'
                elif status == 'paused':
                    campaign['status'] = 'Paused'
                else:
                    campaign['status'] = status.capitalize() if status else 'Unknown'

                # Format date
                if campaign['dateTime']:
                    try:
                        # Attempt to parse and reformat for UI
                        dt = datetime.strptime(campaign['dateTime'], '%Y-%m-%d %H:%M:%S')
                        campaign['dateTime'] = dt.strftime('%Y-%m-%d %I:%M %p')
                    except:
                        pass # Keep original if parsing fails

                # Fetch sender accounts for this campaign
                cursor.execute("""
                    SELECT 
                        COALESCE(et.sender_email, se.sender_email) as senderEmail,
                        COUNT(*) as sentCount
                    FROM email_tracking et
                    LEFT JOIN sent_emails se ON et.campaign_id = se.campaign_id AND et.recipient_email = se.recipient_email
                    WHERE et.campaign_id = ?
                    GROUP BY COALESCE(et.sender_email, se.sender_email)
                    ORDER BY senderEmail
                """, (campaign['campaignId'],))
                
                accounts = [dict(row) for row in cursor.fetchall()]
                
                for account in accounts:
                    # Fetch recipients for this sender account in this campaign
                    # Limit to avoid massive payloads if something went wrong
                    sender_email = account['senderEmail']
                    cursor.execute("""
                        SELECT et.recipient_email
                        FROM email_tracking et
                        LEFT JOIN sent_emails se ON et.campaign_id = se.campaign_id AND et.recipient_email = se.recipient_email
                        WHERE et.campaign_id = ? AND (et.sender_email = ? OR (et.sender_email IS NULL AND se.sender_email = ?))
                        ORDER BY et.recipient_email
                        LIMIT 500
                    """, (campaign['campaignId'], sender_email, sender_email))
                    
                    account['recipients'] = [row['recipient_email'] for row in cursor.fetchall()]
                    # Generate a stable unique ID for the account
                    email_str = account['senderEmail'] if account['senderEmail'] else "unknown"
                    email_hash = hashlib.md5(email_str.encode()).hexdigest()[:8]
                    account['accountId'] = f"acc-{campaign['campaignId']}-{email_hash}"
                
                campaign['accounts'] = accounts
                
            return campaigns
            
        except sqlite3.Error as e:
            print(f"Error getting nested campaign history: {e}")
            return []
        finally:
            if connection:
                connection.close()

    def get_paginated_recipients(self, campaign_id, sender_email=None, page=1, page_size=10):
        """Get paginated recipients for a campaign or specific sender account"""
        connection = self.get_connection()
        if not connection:
            return {"recipients": [], "totalCount": 0}
            
        try:
            cursor = connection.cursor()
            offset = (page - 1) * page_size
            
            # Count total
            count_query = "SELECT COUNT(*) FROM email_tracking WHERE campaign_id = ?"
            params = [campaign_id]
            
            if sender_email:
                count_query += " AND (sender_email = ? OR (sender_email IS NULL AND campaign_id IN (SELECT DISTINCT campaign_id FROM sent_emails WHERE sender_email = ?)))"
                params.append(sender_email)
                params.append(sender_email)
                
            cursor.execute(count_query, tuple(params))
            total_count = cursor.fetchone()[0]
            
            # Fetch recipients
            data_query = """
                SELECT 
                    recipient_email, 
                    recipient_name, 
                    status, 
                    sent_time, 
                    reply_message, 
                    reply_time,
                    COALESCE(
                        sender_email,
                        (
                            SELECT se.sender_email 
                            FROM sent_emails se 
                            WHERE se.campaign_id = email_tracking.campaign_id 
                              AND se.recipient_email = email_tracking.recipient_email
                            ORDER BY se.rowid DESC 
                            LIMIT 1
                        )
                    ) AS sender_email
                FROM email_tracking
                WHERE campaign_id = ?
            """
            if sender_email:
                data_query += " AND (sender_email = ? OR (sender_email IS NULL AND campaign_id IN (SELECT DISTINCT campaign_id FROM sent_emails WHERE sender_email = ?)))"
                
            data_query += " ORDER BY recipient_email LIMIT ? OFFSET ?"
            
            data_params = list(params)
            data_params.extend([page_size, offset])
            
            cursor.execute(data_query, tuple(data_params))
            rows = cursor.fetchall()
            
            recipients = [dict(row) for row in rows]
            
            return {
                "recipients": recipients,
                "totalCount": total_count,
                "pageSize": page_size,
                "currentPage": page
            }
        except sqlite3.Error as e:
            print(f"Error in get_paginated_recipients: {e}")
            return {"recipients": [], "totalCount": 0}
        finally:
            if connection:
                connection.close()
    
    def get_recipient_replies(self, campaign_id, recipient_email):
        """Get all replies from a specific recipient for a campaign"""
        connection = self.get_connection()
        if not connection:
            return []
            
        try:
            cursor = connection.cursor()
            
            # Get tracking ID first
            cursor.execute("""
                SELECT id FROM email_tracking 
                WHERE campaign_id = ? AND recipient_email = ?
            """, (campaign_id, recipient_email))
            
            tracking_row = cursor.fetchone()
            if not tracking_row:
                return []
                
            tracking_id = tracking_row[0]
            
            # Get all replies from replied_users table
            cursor.execute("""
                SELECT 
                    reply_message,
                    reply_time,
                    reply_subject
                FROM replied_users
                WHERE tracking_id = ?
                ORDER BY reply_time ASC
            """, (tracking_id,))
            
            rows = cursor.fetchall()
            replies = [dict(row) for row in rows]
            
            # If no replies in replied_users, check email_tracking for legacy data
            if not replies:
                cursor.execute("""
                    SELECT 
                        reply_message,
                        reply_time
                    FROM email_tracking
                    WHERE id = ? AND reply_message IS NOT NULL
                """, (tracking_id,))
                
                legacy_row = cursor.fetchone()
                if legacy_row:
                    replies = [{
                        'reply_message': legacy_row[0],
                        'reply_time': legacy_row[1],
                        'reply_subject': None
                    }]
            
            return replies
        except sqlite3.Error as e:
            print(f"Error in get_recipient_replies: {e}")
            return []
        finally:
            if connection:
                connection.close()

    def get_campaign_content(self, campaign_id):
        """Get the subject and body of an email from a campaign"""
        connection = self.get_connection()
        if not connection:
            return None
            
        try:
            cursor = connection.cursor()
            # Debug: Log the campaign_id being searched
            print(f"🔍 Searching for campaign_id: {campaign_id} (type: {type(campaign_id)})")
            
            # Try to get from sent_emails first
            cursor.execute("""
                SELECT subject, body FROM sent_emails 
                WHERE campaign_id = ? 
                LIMIT 1
            """, (campaign_id,))
            result = cursor.fetchone()
            
            # Debug: Check if result was found
            if result:
                print(f"✅ Found content for campaign {campaign_id}")
                return dict(result)
            else:
                print(f"❌ No content found for campaign {campaign_id}")
                # Debug: Check what campaign_ids exist
                cursor.execute("SELECT DISTINCT campaign_id FROM sent_emails ORDER BY campaign_id DESC LIMIT 10")
                existing_ids = [row[0] for row in cursor.fetchall()]
                print(f"📋 Existing campaign_ids: {existing_ids}")
            
            return {"subject": "No content found", "body": "The email content for this campaign could not be retrieved."}
        except sqlite3.Error as e:
            print(f"Error in get_campaign_content: {e}")
            return None
        finally:
            if connection:
                connection.close()


# Global database instance
db = Database()