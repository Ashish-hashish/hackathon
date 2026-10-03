"""Client IP resolution and subnet prefix bucketing.

Rule 2: Client IP is read ONLY via get_client_ip.
Never trusts client-supplied headers (X-Forwarded-For, Forwarded, etc.).
Only accepts X-Real-IP if the direct TCP peer is a verified trusted reverse proxy.
Normalizes IPv4 to /24 and IPv6 to /64 buckets to prevent IP rotation evasion.
"""

import ipaddress
import os
from typing import List, Any

# Parse trusted proxy CIDRs from environment
DEFAULT_TRUSTED_CIDRS = os.getenv("TRUSTED_PROXY_CIDR", "127.0.0.1/32,172.16.0.0/12,10.0.0.0/8,192.168.0.0/16")
TRUSTED_NETWORKS: List[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
for cidr in DEFAULT_TRUSTED_CIDRS.split(","):
    cidr = cidr.strip()
    if cidr:
        try:
            TRUSTED_NETWORKS.append(ipaddress.ip_network(cidr))
        except ValueError:
            pass


def is_peer_trusted(peer_ip: str) -> bool:
    """Checks if the immediate TCP socket peer is a trusted reverse proxy."""
    if not peer_ip:
        return False
    try:
        ip_obj = ipaddress.ip_address(peer_ip)
        return any(ip_obj in net for net in TRUSTED_NETWORKS)
    except ValueError:
        return False


def get_client_ip(request: Any, trust_proxy_enabled: bool = True) -> str:
    """Authoritative client IP resolver.
    
    If the direct connection is from a trusted proxy (nginx) and trust_proxy_enabled is True,
    reads X-Real-IP (which nginx has overwritten with the real socket address).
    In ALL other cases, returns the raw TCP socket address (request.client.host).
    NEVER reads X-Forwarded-For, Forwarded, CF-Connecting-IP, or True-Client-IP.
    """
    peer_ip = request.client.host if request.client else "127.0.0.1"

    if trust_proxy_enabled and is_peer_trusted(peer_ip):
        # Nginx sets X-Real-IP = $remote_addr
        x_real_ip = request.headers.get("x-real-ip")
        if x_real_ip:
            cleaned = x_real_ip.strip()
            try:
                ipaddress.ip_address(cleaned)
                return cleaned
            except ValueError:
                pass

    return peer_ip


def get_ip_prefix(ip_str: str) -> str:
    """Normalizes an IP string to a /24 (IPv4) or /64 (IPv6) subnet prefix.
    
    Ensures rate limits and soft clustering cannot be evaded by rotating
    the last octet of an IP or cycling through /128 addresses.
    """
    try:
        ip = ipaddress.ip_address(ip_str.strip())
        if isinstance(ip, ipaddress.IPv4Address):
            # Mask to /24: e.g. 192.168.1.100 -> 192.168.1.0/24
            net = ipaddress.ip_network(f"{ip}/24", strict=False)
            return str(net)
        else:
            # Mask to /64: e.g. 2001:db8:85a3:: -> 2001:db8:85a3::/64
            net = ipaddress.ip_network(f"{ip}/64", strict=False)
            return str(net)
    except ValueError:
        return f"{ip_str}/32"
