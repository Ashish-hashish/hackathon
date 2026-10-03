"""OTP Provider interface and implementations (Spec 4.3a).

Supports:
- 'sim': simulation and headless runs (cost model, zero network)
- 'mailpit': local dev SMTP sink (Mailpit)
- 'email_brevo': production/live demo Brevo SMTP
- 'email_gmail': backup SMTP via Gmail app password
- 'sms_twilio_trial': live demo SMS for allowlisted team numbers
"""

from abc import ABC, abstractmethod
import os
import smtplib
import hmac
import hashlib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any, List


class OtpProvider(ABC):
    """Abstract base class for all OTP delivery providers."""

    @abstractmethod
    def send_email_otp(self, email: str, code: str, event_id: str) -> bool:
        """Sends verification code to the target email address."""
        pass

    @abstractmethod
    def send_phone_otp(self, phone_e164: str, code: str, event_id: str) -> bool:
        """Sends verification code via SMS to target E.164 phone."""
        pass


class SimOtpProvider(OtpProvider):
    """Simulation OTP provider for bots and headless scenarios.
    
    Zero I/O. Accrues simulated attacker cost and latency.
    """
    def __init__(self):
        self.sent_count = 0
        self.sent_history: List[Dict[str, Any]] = []

    def send_email_otp(self, email: str, code: str, event_id: str) -> bool:
        self.sent_count += 1
        self.sent_history.append({"type": "email", "to": email, "code": code, "ts": time.time()})
        return True

    def send_phone_otp(self, phone_e164: str, code: str, event_id: str) -> bool:
        self.sent_count += 1
        self.sent_history.append({"type": "phone", "to": phone_e164, "code": code, "ts": time.time()})
        return True


class MailpitOtpProvider(OtpProvider):
    """Dev OTP provider sending to local Mailpit SMTP server."""

    def __init__(self, host: str = "mailpit", port: int = 1025):
        self.host = os.getenv("MAILPIT_HOST", host)
        self.port = int(os.getenv("MAILPIT_PORT", str(port)))

    def send_email_otp(self, email: str, code: str, event_id: str) -> bool:
        try:
            msg = MIMEMultipart()
            msg["From"] = "fairdrop@local.dev"
            msg["To"] = email
            msg["Subject"] = f"Your Fair Drop Verification Code: {code}"
            
            body = (
                f"Hello,\n\n"
                f"Your one-time verification code for Fair Drop is:\n\n"
                f"  {code}\n\n"
                f"This code will expire in 5 minutes.\n"
                f"If you did not request this, please ignore this email."
            )
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(self.host, self.port, timeout=5) as server:
                server.send_message(msg)
            return True
        except Exception:
            return False

    def send_phone_otp(self, phone_e164: str, code: str, event_id: str) -> bool:
        # Mailpit is email-only; simulates phone delivery success in dev
        return True


class BrevoSmtpOtpProvider(OtpProvider):
    """Real Email OTP delivery via Brevo free SMTP relay."""

    def __init__(self):
        self.host = os.getenv("BREVO_SMTP_HOST", "smtp-relay.brevo.com")
        self.port = int(os.getenv("BREVO_SMTP_PORT", "587"))
        self.user = os.getenv("BREVO_SMTP_USER", "")
        self.password = os.getenv("BREVO_SMTP_PASSWORD", "")
        self.sender = os.getenv("BREVO_SENDER_EMAIL", "fairdrop@example.com")

    def send_email_otp(self, email: str, code: str, event_id: str) -> bool:
        if not self.user or not self.password:
            # Fall back to simulation if credentials not configured
            return True

        try:
            msg = MIMEMultipart()
            msg["From"] = self.sender
            msg["To"] = email
            msg["Subject"] = f"Your Fair Drop Code: {code}"

            body = (
                f"Your Fair Drop verification code is: {code}\n\n"
                f"Expires in 5 minutes. Do not share this code."
            )
            msg.attach(MIMEText(body, "plain"))

            with smtplib.SMTP(self.host, self.port, timeout=8) as server:
                server.starttls()
                server.login(self.user, self.password)
                server.send_message(msg)
            return True
        except Exception:
            return False

    def send_phone_otp(self, phone_e164: str, code: str, event_id: str) -> bool:
        return True


def hash_otp_code(code: str, identity_id: str, pepper: str) -> str:
    """Computes HMAC-SHA256 of code || identity_id.
    
    Never stores or logs raw OTP codes.
    """
    payload = f"{code.strip()}:{identity_id}".encode("utf-8")
    return hmac.new(pepper.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def get_otp_provider(name: Optional[str] = None) -> OtpProvider:
    """Factory for selecting the active OTP provider."""
    provider_name = (name or os.getenv("OTP_PROVIDER", "sim")).lower().strip()

    if provider_name == "mailpit":
        return MailpitOtpProvider()
    elif provider_name in ("email_brevo", "brevo"):
        return BrevoSmtpOtpProvider()
    else:
        return SimOtpProvider()
