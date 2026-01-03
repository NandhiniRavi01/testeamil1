"""
Email Service for checking emails, bounces, and replies
"""
import imaplib
import email
from email.header import decode_header
from typing import Dict, List, Optional
from .service import (
    check_email_replies,
    check_email_bounces,
    detect_email_provider,
    extract_recipient_from_bounce,
    is_auto_response
)


class EmailService:
    """Service to handle email checking, bounce detection, and reply tracking"""
    
    def __init__(self, email_address: str, password: str, provider: Optional[str] = None):
        """
        Initialize EmailService
        
        Args:
            email_address: Email address to check
            password: Email password or app-specific password
            provider: Email provider (e.g., 'gmail', 'outlook', 'yahoo')
        """
        self.email_address = email_address
        self.password = password
        self.provider = provider or self._detect_provider()
        self.authenticated = False
        
    def _detect_provider(self) -> str:
        """Detect email provider from email address"""
        try:
            provider_info = detect_email_provider(self.email_address)
            return provider_info.get('name', 'gmail')
        except:
            return 'gmail'  # Default fallback
    
    def authenticate(self) -> bool:
        """
        Authenticate with the email service
        
        Returns:
            bool: True if authentication successful, False otherwise
        """
        try:
            if self.provider == 'custom':
                # Custom provider handling
                self.authenticated = True
                return True
            else:
                # Try to connect to IMAP to verify credentials
                provider_info = detect_email_provider(self.email_address)
                imap_server = provider_info['imap_server']
                imap_port = provider_info['imap_port']
                use_ssl = provider_info.get('use_ssl', True)
                
                if use_ssl:
                    mail = imaplib.IMAP4_SSL(imap_server, imap_port)
                else:
                    mail = imaplib.IMAP4(imap_server, imap_port)
                    mail.starttls()
                
                mail.login(self.email_address, self.password)
                mail.logout()
                
                self.authenticated = True
                return True
        except Exception as e:
            print(f"❌ Authentication failed: {str(e)}")
            return False
    
    def fetch_emails(self) -> Dict:
        """
        Fetch emails and calculate metrics
        
        Returns:
            dict: Email metrics including bounces, replies, and sent status
        """
        if not self.authenticated and not self.authenticate():
            raise Exception("Authentication required. Please check your email credentials.")
        
        try:
            # Check for bounced emails
            bounced_emails = check_email_bounces(
                self.email_address,
                self.password,
                self.provider
            )
            
            # Check for replies
            replied_emails = check_email_replies(
                self.email_address,
                self.password,
                self.provider
            )
            
            # Calculate metrics
            bounce_count = len(bounced_emails) if bounced_emails else 0
            replied_count = len(replied_emails) if replied_emails else 0
            
            return {
                'bounced_emails': bounced_emails or [],
                'replied_emails': replied_emails or [],
                'bounce_count': bounce_count,
                'replied_count': replied_count
            }
        except Exception as e:
            raise Exception(f"Error fetching emails: {str(e)}")
    
    def calculate_bounce_count(self, emails: Dict) -> int:
        """
        Calculate bounce count from emails
        
        Args:
            emails: Dictionary of emails from fetch_emails()
            
        Returns:
            int: Count of bounced emails
        """
        return emails.get('bounce_count', 0)
    
    def calculate_replied_count(self, emails: Dict) -> int:
        """
        Calculate replied count from emails
        
        Args:
            emails: Dictionary of emails from fetch_emails()
            
        Returns:
            int: Count of replied emails
        """
        return emails.get('replied_count', 0)
    
    def calculate_sent_status(self, emails: Dict) -> Dict:
        """
        Calculate sent status metrics
        
        Args:
            emails: Dictionary of emails from fetch_emails()
            
        Returns:
            dict: Status information
        """
        bounce_count = emails.get('bounce_count', 0)
        replied_count = emails.get('replied_count', 0)
        
        return {
            'total_bounced': bounce_count,
            'total_replied': replied_count,
            'auto_responses': sum(
                1 for email_data in emails.get('replied_emails', [])
                if is_auto_response(email_data.get('subject', ''), email_data.get('body', ''))
            )
        }
    
    def get_detailed_summary(self) -> Dict:
        """
        Get a detailed summary of email metrics
        
        Returns:
            dict: Detailed summary with all metrics
        """
        if not self.authenticated and not self.authenticate():
            raise Exception("Authentication required. Please check your email credentials.")
        
        try:
            emails = self.fetch_emails()
            
            return {
                'status': 'success',
                'email': self.email_address,
                'provider': self.provider,
                'metrics': {
                    'bounce_count': self.calculate_bounce_count(emails),
                    'replied_count': self.calculate_replied_count(emails),
                    'sent_status': self.calculate_sent_status(emails)
                },
                'bounced_emails': [
                    {
                        'recipient': b.get('recipient', 'Unknown'),
                        'reason': b.get('bounce_reason', 'Unknown'),
                        'timestamp': b.get('timestamp', '')
                    }
                    for b in emails.get('bounced_emails', [])
                ][:10],  # Limit to 10 for display
                'replied_emails': [
                    {
                        'sender': r.get('sender', 'Unknown'),
                        'subject': r.get('subject', 'No Subject'),
                        'timestamp': r.get('timestamp', '')
                    }
                    for r in emails.get('replied_emails', [])
                ][:10]  # Limit to 10 for display
            }
        except Exception as e:
            raise Exception(f"Error generating summary: {str(e)}")
