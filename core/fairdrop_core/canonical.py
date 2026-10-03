"""Canonicalization and deduplication for emails and phone numbers.

Guards against Sybil alias generation (+tags, dots in Gmail, disposable domains).
Pure functions, zero external dependencies.
"""

import hmac
import hashlib
import re
from typing import Optional

# Known disposable email domains (bundled list for zero-network validation)
DISPOSABLE_DOMAINS = frozenset([
    "mailinator.com",
    "yopmail.com",
    "10minutemail.com",
    "guerrillamail.com",
    "sharklasers.com",
    "grr.la",
    "guerrillamail.biz",
    "guerrillamail.com",
    "guerrillamail.de",
    "guerrillamail.net",
    "guerrillamail.org",
    "guerrillamailblock.com",
    "pokemail.net",
    "spam4.me",
    "tempmail.com",
    "temp-mail.org",
    "throwawaymail.com",
    "fakeinbox.com",
    "dispostable.com",
    "trashmail.com",
    "getnada.com",
    "abacusmail.com",
    "inboxkitten.com",
    "mohmal.com",
    "crazymailing.com",
    "burnermail.io",
    "mytemp.email",
    "emailondeck.com",
    "mytempmail.com",
    "dropmail.me",
    "armyspy.com",
    "cuvox.de",
    "dayrep.com",
    "fleckens.hu",
    "gustr.com",
    "jourrapide.com",
    "rhyta.com",
    "superrito.com",
    "teleworm.us",
    "tinymember.com",
])

# Domains that ignore dots and accept '+' tags
GMAIL_DOMAINS = frozenset(["gmail.com", "googlemail.com"])
YAHOO_DOMAINS = frozenset(["yahoo.com", "ymail.com", "rocketmail.com"])
OUTLOOK_DOMAINS = frozenset(["outlook.com", "hotmail.com", "live.com", "msn.com"])


def is_disposable_domain(email_or_domain: str) -> bool:
    """Returns True if the email belongs to a known temporary/disposable provider."""
    domain = email_or_domain.lower().strip()
    if "@" in domain:
        domain = domain.split("@", 1)[1]
    return domain in DISPOSABLE_DOMAINS


def canonicalize_email(email: str, enabled: bool = True) -> str:
    """Canonicalize an email address to collapse aliases.
    
    If enabled is False (ablation mode), simply strips whitespace and lowercases.
    When enabled:
      - Lowercases and strips whitespace
      - Unifies googlemail.com -> gmail.com
      - For Gmail: strips dots and +tags
      - For other providers (Outlook, Yahoo, etc.): strips +tags
    """
    cleaned = email.strip().lower()
    if "@" not in cleaned:
        return cleaned

    local_part, domain = cleaned.split("@", 1)

    if not enabled:
        return f"{local_part}@{domain}"

    # Normalize domain aliases
    if domain in GMAIL_DOMAINS:
        domain = "gmail.com"
        # Gmail ignores dots
        local_part = local_part.replace(".", "")
        # Gmail ignores everything after +
        local_part = local_part.split("+", 1)[0]
    elif domain in OUTLOOK_DOMAINS or domain in YAHOO_DOMAINS or "+" in local_part:
        # Most major providers support + tags
        local_part = local_part.split("+", 1)[0]

    return f"{local_part}@{domain}"


def normalize_phone_e164(phone: str) -> str:
    """Normalizes phone string to clean digits with leading '+'.
    
    Removes spaces, hyphens, parentheses, dots.
    Ensures E.164 leading '+'. Defaults to + if absent but has country code,
    or expects a standard numeric format.
    """
    cleaned = phone.strip()
    # Keep leading + if present
    has_plus = cleaned.startswith("+")
    digits = re.sub(r"\D", "", cleaned)
    if not digits:
        return ""
    if has_plus:
        return f"+{digits}"
    # If 10 digits without +, e.g., US/India standard local entry, normalize or prefix:
    return f"+{digits}"


def hash_phone(phone: str, pepper: str, enabled: bool = True) -> str:
    """Hashes a phone number using HMAC-SHA256 with a secret pepper.
    
    Never stores raw phone numbers in Postgres or Redis.
    """
    normalized = normalize_phone_e164(phone) if enabled else phone.strip()
    if not normalized:
        return ""
    return hmac.new(
        pepper.encode("utf-8"),
        normalized.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()
