from flask import Flask, Blueprint, request, jsonify
import re
import tldextract
import warnings
import time
import random
import json
import urllib.parse as urlparse
from datetime import datetime, timedelta
from pathlib import Path
from ddgs import DDGS
from email_validator import validate_email, EmailNotValidError
from validate_email_address import validate_email as smtp_validate
import dns.resolver
from typing import Dict, List, Optional
import requests
from bs4 import BeautifulSoup
import signal 
from pathlib import Path
from config import GENAI_API_KEY
import google.generativeai as genai

if GENAI_API_KEY:
    genai.configure(api_key=GENAI_API_KEY)

warnings.filterwarnings("ignore", category=DeprecationWarning)

# ---------- Web Scraping Config ----------
REQUEST_TIMEOUT = 10
RETRY = 2
DELAY_MIN = 0.8
DELAY_MAX = 1.8

COMMON_CONTACT_PATHS = [
    "/contact", "/contact-us", "/contactus", "/about", "/about-us", "/aboutus",
    "/team", "/support", "/help", "/customer-service", "/get-in-touch", "/connect"
]

EMAIL_REGEX = re.compile(r"[a-zA-Z0-9.\-+_]{1,64}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", re.I)

# FIXED: Enhanced phone regex that handles tuple groups properly
PHONE_REGEX = re.compile(
    r'(\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,4})'
    r'|(\+?\(\d{1,4}\)[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,4})'
    r'|(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})'
    r'|(\d{4}[-.\s]?\d{3}[-.\s]?\d{3})'
    r'|(\d{2}[-.\s]?\d{4}[-.\s]?\d{4})'
    r'|(\+\d{1,3}[-.\s]?\d{1,14})'
    r'|(tel[:\s]+[\+]?[\d\s\-\(\)]{7,})'
    r'|(phone[:\s]+[\+]?[\d\s\-\(\)]{7,})'
    r'|(mobile[:\s]+[\+]?[\d\s\-\(\)]{7,})'
)

SOCIAL_PLATFORMS = {
    "linkedin.com", "facebook.com", "twitter.com", "x.com", "instagram.com",
    "youtube.com", "tiktok.com", "whatsapp.com", "telegram.org"
}

# ---------- Lead Generator Config ----------
CONFIG = {
    "rate_limit_delay": (3, 7),
    "cache_ttl_hours": 24,
    "max_results_per_search": 50,
}

USER_AGENTS = [
    # Latest Chrome versions
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    
    # Latest Firefox versions
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0",
    
    # Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    
    # Edge
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0"
]

# ---------- NEW: Enhanced Domain Validation & Fallback Functions ----------
def validate_company_domain(company_name, domain):
    """More lenient domain validation"""
    if not company_name or not domain:
        return False

    # Clean the inputs
    company_clean = re.sub(r'[^a-zA-Z0-9\s]', '', company_name).lower().strip()
    domain_clean = domain.lower()

    # Remove common TLDs for comparison
    domain_clean = re.sub(r'\.(com|org|net|co|io|ai)$', '', domain_clean)

    # Check for exact matches first
    if company_clean.replace(' ', '') == domain_clean.replace(' ', ''):
        return True

    # Check if company name words appear in domain
    company_words = [word for word in company_clean.split() if len(word) > 2]

    for word in company_words:
        if word in domain_clean:
            return True

    # Allow common variations
    variations = [
        f"the{company_clean.replace(' ', '')}",
        f"get{company_clean.replace(' ', '')}",
        f"{company_clean.replace(' ', '')}inc",
        f"{company_clean.replace(' ', '')}llc",
    ]

    if any(var in domain_clean for var in variations):
        return True

    print(f"⚠️  Domain mismatch: '{company_name}' ≠ '{domain}'")
    return False

def find_company_website_advanced(company_name, location=None, industry=None):
    """More targeted domain search with multiple queries"""
    queries = []

    # Base queries
    base_queries = [
        f'"{company_name}" official website',
        f'"{company_name}" contact',
        f'"{company_name}" company',
        f'"{company_name}" email',
        f'"{company_name}" @gmail.com',
        f'"{company_name}" contact information'
    ]

    queries.extend(base_queries)

    # Location-specific queries
    if location:
        queries.extend([
            f'"{company_name}" {location} website',
            f'"{company_name}" {location} contact',
            f'"{company_name}" {location} company'
        ])

    # Industry-specific queries
    if industry:
        queries.extend([
            f'"{company_name}" {industry} company',
            f'"{company_name}" {industry} {location}' if location else f'"{company_name}" {industry}'
        ])

    for query in queries:
        if query:
            print(f"  Trying domain search: {query}")
            domain = search_domain_with_query(query)
            if domain and validate_company_domain(company_name, domain):
                print(f"  ✅ Found valid domain: {domain}")
                return domain
            elif domain:
                print(f"  ⚠️  Domain found but invalid: {domain}")

    return None

def search_domain_with_query(query):
    """Search for domain using a specific query"""
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=3))
            for result in results:
                url = result.get("href", "")
                if url:
                    ext = tldextract.extract(url)
                    if ext.domain and ext.suffix:
                        domain = f"{ext.domain}.{ext.suffix}".lower()
                        # Basic domain validation
                        if len(ext.domain) > 2 and ext.suffix:
                            return domain
    except Exception as e:
        print(f"  Domain search error: {e}")

    return None

def find_emails_without_domain(company_name, person_name, location=None):
    """Search for emails directly without needing domain"""
    contacts = []

    queries = [
        f'"{person_name}" "{company_name}" email',
        f'"{person_name}" "{company_name}" @gmail.com',
        f'"{person_name}" "{company_name}" contact',
        f'"{person_name}" {location} "{company_name}" email' if location else None,
        f'"{company_name}" contact email',
        f'"{company_name}" email address'
    ]

    for query in queries:
        if query:
            try:
                print(f"  Direct email search: {query}")
                with DDGS() as ddgs:
                    results = list(ddgs.text(query, max_results=5))
                    for result in results:
                        # Extract emails from title and snippet
                        text = f"{result.get('title', '')} {result.get('body', '')}"
                        emails = extract_emails_from_text(text)
                        for email in emails:
                            contacts.append({
                                "email": email,
                                "source": "direct_search",
                                "source_url": result.get("href", ""),
                                "score": 70  # Slightly lower score for direct search
                            })
            except Exception as e:
                print(f"  Direct email search error: {e}")
                continue

    return contacts

def search_business_directories(company_name, location=None, industry=None):
    """Search business directories for contact info with location/industry"""
    contacts = []

    directories = [
        f'"{company_name}" site:zoominfo.com',
        f'"{company_name}" site:crunchbase.com',
        f'"{company_name}" site:owler.com',
        f'"{company_name}" site:linkedin.com/company',
        f'"{company_name}" site:facebook.com/pages',
        f'"{company_name}" site:yellowpages.com',
    ]

    # ADDED: Location-specific directory queries
    if location:
        directories.extend([
            f'"{company_name}" {location} site:zoominfo.com',
            f'"{company_name}" {location} site:yellowpages.com',
            f'"{company_name}" {location} business directory',
        ])

    # ADDED: Industry-specific directory queries
    if industry:
        directories.extend([
            f'"{company_name}" {industry} site:crunchbase.com',
            f'"{company_name}" {industry} companies',
        ])

    for query in directories:
        try:
            print(f"  Directory search: {query}")
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=3))
                for result in results:
                    text = f"{result.get('title', '')} {result.get('body', '')}"
                    emails = extract_emails_from_text(text)
                    for email in emails:
                        contacts.append({
                            "email": email,
                            "source": "business_directory",
                            "source_url": result.get("href", ""),
                            "score": 75
                        })
        except Exception as e:
            print(f"  Directory search error: {e}")
            continue

    return contacts

def guess_common_domains(company_name, location=None, industry=None):
    """Try common domain patterns with location/industry variations"""
    # Clean company name for domain generation
    company_slug = re.sub(r'[^a-zA-Z0-9]', '', company_name).lower()

    if len(company_slug) < 3:
        return None

    common_patterns = [
        f"{company_slug}.com",
        f"{company_slug}.org",
        f"{company_slug}.net",
        f"get{company_slug}.com",
        f"{company_slug}inc.com",
        f"{company_slug}llc.com",
        f"{company_slug}company.com",
        f"the{company_slug}.com",
    ]

    # ADDED: Location-based domain patterns
    if location:
        location_slug = re.sub(r'[^a-zA-Z0-9]', '', location).lower().replace(' ', '')
        common_patterns.extend([
            f"{company_slug}{location_slug}.com",
            f"{location_slug}{company_slug}.com",
            f"{company_slug}-{location_slug}.com",
        ])

    # ADDED: Industry-based domain patterns
    if industry:
        industry_slug = re.sub(r'[^a-zA-Z0-9]', '', industry).lower().replace(' ', '')
        common_patterns.extend([
            f"{company_slug}{industry_slug}.com",
            f"{industry_slug}{company_slug}.com",
        ])

    # Test if domains exist
    for domain in common_patterns:
        try:
            response = requests.head(f"https://{domain}", timeout=5, allow_redirects=True)
            if response.status_code < 400:
                print(f"  ✅ Guessed domain exists: {domain}")
                return domain
        except:
            continue

    return None

# ---------- Enhanced HTML Extraction ----------
def extract_company_info(soup, domain):
    """Extract company information from website - FIXED HTML handling"""
    company_info = {}

    # Company name from various sources (FIXED: extract text, not HTML)
    name_sources = [
        soup.find("meta", property="og:site_name"),
        soup.find("meta", attrs={"name": "application-name"}),
        soup.find("title")
    ]

    for source in name_sources:
        if source:
            # Extract text content, not HTML
            if hasattr(source, 'get'):
                content = source.get("content", "")
            else:
                content = source.get_text()

            if content:
                # Clean HTML tags and extra spaces
                content_clean = re.sub(r'<[^>]+>', '', str(content)).strip()
                if content_clean and len(content_clean) > 3:
                    company_info["name"] = content_clean[:100]
                    break

    # Company description (FIXED: clean HTML)
    desc = soup.find("meta", attrs={"name": "description"})
    if desc and desc.get("content"):
        desc_clean = re.sub(r'<[^>]+>', '', desc.get("content")).strip()
        company_info["description"] = desc_clean[:200]

    return company_info

# ---------- Rest of the existing functions (with minor enhancements) ----------
def is_social_platform(domain):
    """Check if domain is a social platform for smart scraping"""
    return domain in SOCIAL_PLATFORMS

def polite_sleep():
    time.sleep(random.uniform(DELAY_MIN, DELAY_MAX))

def normalize_url(url):
    if not url:
        return None
    if not urlparse.urlparse(url).scheme:
        url = "http://" + url
    return url

def get_random_user_agent():
    return random.choice(USER_AGENTS)

def fetch_url(url):
    url = normalize_url(url)
    for attempt in range(RETRY):
        try:
            headers = {"User-Agent": get_random_user_agent()}
            resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT, allow_redirects=True)
            return resp
        except requests.RequestException:
            polite_sleep()
    return None

def extract_emails_from_text(text):
    if not text:
        return set()
    return set(m.group(0).strip().rstrip('.,;:') for m in EMAIL_REGEX.finditer(text))

def extract_phones_from_text(text):
    """Extract phones from text - FIXED to handle tuple groups"""
    if not text:
        return set()

    phones = set()
    matches = PHONE_REGEX.finditer(text)

    for match in matches:
        # Handle tuple matches - take the first non-None group
        for group_num in range(1, len(match.groups()) + 1):
            phone = match.group(group_num)
            if phone and phone.strip():
                phones.add(phone.strip())
                break

    return phones

def find_contact_pages(root_url):
    """Generate candidate contact page URLs to try (root + common_paths)."""
    root = normalize_url(root_url)
    parsed = urlparse.urlparse(root)
    base = f"{parsed.scheme}://{parsed.netloc}"
    candidates = [base, base + "/"]
    for p in COMMON_CONTACT_PATHS:
        candidates.append(base + p)
    return candidates

def parse_page_for_contacts(resp, base_url=None):
    """Parse HTML for mailto links, emails, phones, contact forms, and social links."""
    found = {
        "emails": set(),
        "phones": set(),
        "mailto_links": set(),
        "contact_forms": [],
        "social_links": set(),
        "raw_text_emails": set()
    }
    if resp is None or resp.status_code != 200:
        return found

    soup = BeautifulSoup(resp.text, "html.parser")

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("mailto:"):
            addr = href.split(":", 1)[1].split("?")[0]
            found["mailto_links"].add(addr)
            found["emails"].add(addr)
        if any(domain in href for domain in SOCIAL_PLATFORMS):
            found["social_links"].add(href)

    text = soup.get_text(separator=" ", strip=True)
    found["raw_text_emails"].update(extract_emails_from_text(text))
    found["phones"].update(extract_phones_from_text(text))

    for form in soup.find_all("form"):
        action = form.get("action", "")
        form_id = form.get("id", "")
        form_classes = form.get("class", [])

        if isinstance(form_classes, list):
            form_classes = " ".join(form_classes)

        form_text = f"{action} {form_id} {form_classes}".lower()

        if any(k in form_text for k in ["contact", "inquiry", "support", "lead", "signup"]):
            found["contact_forms"].append({
                "action": urlparse.urljoin(base_url or "", action),
                "method": form.get("method", "get").lower(),
                "inputs": [inp.get("name") for inp in form.find_all(["input", "textarea", "select"]) if inp.get("name")]
            })

    for header in soup.find_all(re.compile("^h[1-6]$")):
        header_text = header.get_text(" ", strip=True).lower()
        if any(k in header_text for k in ["contact", "get in touch", "reach", "office", "location", "phone", "email"]):
            sib_text = []
            for sib in header.next_siblings:
                if getattr(sib, "name", None) and sib.name.startswith("h"):
                    break
                sib_text.append(getattr(sib, "get_text", lambda: str(sib))())
            joined = " ".join(sib_text)
            found["raw_text_emails"].update(extract_emails_from_text(joined))
            found["phones"].update(extract_phones_from_text(joined))

    found["emails"].update(found["raw_text_emails"])
    found["emails"].update(found["mailto_links"])
    return found

def scrape_company_for_contacts_enhanced(domain):
    """
    Enhanced contact scraping from company website with company info and employees
    """
    result = {
        "domain": domain,
        "root_url": None,
        "contact_pages_tried": [],
        "emails": {},
        "phones": set(),
        "contact_forms": [],
        "social_links": set(),
        "company_info": {},
        "employees": [],
        "ai_intelligence": {},
        "notes": []
    }
    if not domain:
        return result

    if domain.startswith("http"):
        root_url = domain
    else:
        root_url = "https://" + domain
    result["root_url"] = root_url

    tried = set()

    for p in find_contact_pages(root_url):
        if p in tried:
            continue
        polite_sleep()
        r = fetch_url(p)
        if r is None:
            continue
        result["contact_pages_tried"].append(p)
        tried.add(p)
        found = parse_page_for_contacts(r, base_url=root_url)
        for e in found["emails"]:
            result["emails"].setdefault(e, {"sources": set()})
            result["emails"][e]["sources"].add(p)
        result["phones"].update(found["phones"])
        result["contact_forms"].extend(found["contact_forms"])
        result["social_links"].update(found["social_links"])

        if p == root_url or p == root_url + "/":
            soup = BeautifulSoup(r.text, "html.parser")
            result["company_info"] = extract_company_info(soup, domain)

    if root_url not in tried:
        polite_sleep()
        r = fetch_url(root_url)
        result["contact_pages_tried"].append(root_url)
        if r:
            found = parse_page_for_contacts(r, base_url=root_url)
            for e in found["emails"]:
                result["emails"].setdefault(e, {"sources": set()})
                result["emails"][e]["sources"].add(root_url)
            result["phones"].update(found["phones"])
            result["contact_forms"].extend(found["contact_forms"])
            result["social_links"].update(found["social_links"])

            soup = BeautifulSoup(r.text, "html.parser")
            result["company_info"] = extract_company_info(soup, domain)

    result["employees"] = find_employees_from_website(domain)

    scored = []
    for email, info in result["emails"].items():
        score = 0
        score += min(50, 10 * len(info["sources"]))
        if any("/contact" in s.lower() or "contact" in s.lower() for s in info["sources"]):
            score += 20
        scored.append({
            "email": email,
            "sources": list(info["sources"]),
            "score": min(100, score)
        })
    scored.sort(key=lambda x: x["score"], reverse=True)
    result["emails_list"] = scored

    result["phones"] = list(result["phones"])
    result["social_links"] = list(result["social_links"])
    result["contact_pages_tried"] = list(result["contact_pages_tried"])

    serializable_emails = {}
    for email, info in result["emails"].items():
        serializable_emails[email] = {
            "sources": list(info["sources"]),
        }
    # --- Stage 5: AI Business Intelligence (Synthesize findings) ---
    if GENAI_API_KEY:
        result["ai_intelligence"] = extract_ai_intelligence(result)

    return result

def extract_ai_intelligence(scraped_data):
    """Synthesize scraped data into strategic business intelligence"""
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        context = {
            "domain": scraped_data["domain"],
            "description": scraped_data["company_info"].get("description", "")[:1000]
        }

        if not context["description"]:
             return {}

        prompt = f"""
        Analyze this scraped web data for {context['domain']}:
        {context['description']}

        Provide a strategic summary:
        1. Company Pitch (1 sentence)
        2. Ideal Outreach Hook (personalized based on their tech/values)
        3. Decision Maker Persona (Who should we target?)
        4. Tech Stack Hints (if any found in description)

        Format as JSON.
        """
        response = model.generate_content(prompt)
        try:
            cleaned_text = response.text.strip().replace("```json", "").replace("```", "")
            return json.loads(cleaned_text)
        except:
            return {"summary": response.text.strip()}
    except Exception as e:
        print(f"AI Intelligence error: {e}")
        return {}

def find_employees_from_website(domain):
    """Enhanced employee discovery with full details"""
    employees = []

    employee_pages = [
        f"https://{domain}/team",
        f"https://{domain}/about",
        f"https://{domain}/people", 
        f"https://{domain}/leadership",
        f"https://{domain}/staff",
        f"https://{domain}/management",
        f"https://{domain}/executive-team",
        f"https://{domain}/our-team"
    ]

    # Create instance to access existing methods
    lead_gen = LinkedInLeadGenerator()

    for page_url in employee_pages[:4]:
        try:
            print(f"  🔍 Scanning employee page: {page_url}")
            resp = fetch_url(page_url)
            if resp and resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                
                # Check if this is actually an employee/team page
                page_text = soup.get_text().lower()
                team_indicators = ["team", "employee", "staff", "leadership", "about us", "our people", "executive", "management"]
                
                if any(indicator in page_text for indicator in team_indicators):
                    print(f"  ✅ Found team page: {page_url}")
                    
                    # Extract enhanced employee data
                    page_employees = extract_employee_details(soup, page_url, domain, lead_gen)
                    employees.extend(page_employees)
                    
        except Exception as e:
            print(f"  ❌ Error scanning {page_url}: {e}")
            continue

    # Remove duplicates and return
    unique_employees = remove_duplicate_employees(employees)
    return unique_employees[:15]

def extract_employee_details(soup, page_url, domain, lead_gen):
    """Extract detailed employee information from team page"""
    employees = []
    
    # Common selectors for employee containers
    employee_selectors = [
        '.team-member', '.employee', '.staff', '.person',
        '.team-item', '.member', '.profile',
        '[class*="team"]', '[class*="employee"]', '[class*="staff"]',
        '.executive', '.leadership'
    ]
    
    # Try different container patterns
    employee_containers = []
    for selector in employee_selectors:
        employee_containers.extend(soup.select(selector))
    
    # If no specific containers found, look for common structures
    if not employee_containers:
        # Look for cards, grid items, or list items that might contain employee info
        employee_containers = (soup.select('.card') + soup.select('.grid-item') + 
                             soup.select('.col') + soup.select('.item'))
    
    print(f"    Found {len(employee_containers)} potential employee containers")
    
    for container in employee_containers:
        try:
            employee_data = extract_employee_from_container(container, domain, lead_gen)
            if employee_data and employee_data.get('name'):
                employee_data['source_page'] = page_url
                employees.append(employee_data)
        except Exception as e:
            continue
    
    return employees

def extract_employee_from_container(container, domain, lead_gen):
    """Extract employee details from a single container"""
    employee = {}
    
    # Extract name (multiple patterns)
    name = extract_employee_name(container)
    if not name:
        return None
        
    employee['name'] = name
    
    # Extract job title/role
    employee['role'] = extract_employee_role(container)
    
    # Extract email (multiple patterns) - USE EXISTING FUNCTION
    employee['email'] = extract_employee_email(container, name, domain, lead_gen)
    
    # Extract phone - USE EXISTING FUNCTIONS
    employee['phone'] = extract_employee_phone(container, lead_gen)
    
    # Extract department/team
    employee['department'] = extract_employee_department(container)
    
    # Extract bio/description
    employee['bio'] = extract_employee_bio(container)
    
    # Extract social links
    employee['social_links'] = extract_employee_social_links(container)
    
    # Extract photo URL
    employee['photo_url'] = extract_employee_photo(container)
    
    return employee

def extract_employee_email(container, name, domain, lead_gen):
    """Extract employee email with multiple strategies - USING EXISTING FUNCTIONS"""
    # 1. Look for mailto links
    mailto_links = container.select('a[href^="mailto:"]')
    for link in mailto_links:
        email = link['href'].replace('mailto:', '').split('?')[0].strip()
        # USE EXISTING FUNCTION: is_valid_email
        if lead_gen.is_valid_email(email):
            return email
    
    # 2. Look for email text in container
    container_text = container.get_text()
    email_matches = EMAIL_REGEX.findall(container_text)
    for email in email_matches:
        # USE EXISTING FUNCTION: is_valid_email
        if lead_gen.is_valid_email(email):
            return email
    
    # 3. Generate email from name and domain - USE EXISTING FUNCTION
    if name and domain:
        # USE EXISTING FUNCTION: generate_email_patterns
        generated_emails = lead_gen.generate_email_patterns(name, domain)
        # Validate and return first valid pattern
        for email_pattern in generated_emails:
            if lead_gen.is_valid_email(email_pattern):
                return email_pattern
    
    return None

def extract_employee_phone(container, lead_gen):
    """Extract employee phone number - USING EXISTING FUNCTIONS"""
    container_text = container.get_text()
    phone_matches = PHONE_REGEX.findall(container_text)
    
    for match in phone_matches:
        # Handle tuple matches
        if isinstance(match, tuple):
            phone = next((group for group in match if group is not None), None)
        else:
            phone = match
            
        if phone:
            # USE EXISTING FUNCTION: clean_phone_number
            clean_phone = lead_gen.clean_phone_number(phone)
            # USE EXISTING FUNCTION: validate_phone_format
            if lead_gen.validate_phone_format(clean_phone):
                return clean_phone
    
    return None


# Keep these helper functions (they're new and specific to employee extraction):
def is_likely_person_name(text):
    """Check if text looks like a person name"""
    if not text or len(text) < 4:
        return False
    
    # Common non-name words
    non_names = ['home', 'about', 'contact', 'services', 'products', 'blog', 
                'careers', 'team', 'read more', 'learn more', 'view profile']
    
    if text.lower() in non_names:
        return False
    
    # Should contain at least one space and proper capitalization
    words = text.split()
    if len(words) < 2:
        return False
    
    # Check if words are properly capitalized
    for word in words:
        if len(word) > 1 and not word[0].isupper():
            return False
    
    return True

def clean_name(name):
    """Clean and normalize name"""
    # Remove extra whitespace and common prefixes/suffixes
    name = re.sub(r'\s+', ' ', name).strip()
    name = re.sub(r'^(mr|mrs|ms|dr)\.?\s+', '', name, flags=re.IGNORECASE)
    return name




def extract_employee_name(container):
    """Extract employee name from container"""
    # Try multiple selectors for name
    name_selectors = [
        'h1', 'h2', 'h3', 'h4', 
        '.name', '.employee-name', '.person-name',
        '.full-name', '[class*="name"]',
        'strong', 'b'
    ]
    
    for selector in name_selectors:
        name_elem = container.select_one(selector)
        if name_elem:
            name_text = name_elem.get_text(strip=True)
            if is_likely_person_name(name_text):
                return clean_name(name_text)
    
    # Fallback: extract text and look for name patterns
    container_text = container.get_text(strip=True)
    name_pattern = r'^[A-Z][a-z]+ [A-Z][a-z]+'
    match = re.search(name_pattern, container_text)
    if match and is_likely_person_name(match.group()):
        return clean_name(match.group())
    
    return None

def extract_employee_role(container):
    """Extract employee role/job title"""
    role_selectors = [
        '.title', '.job-title', '.role', '.position',
        '[class*="title"]', '[class*="role"]',
        '.department', '.designation'
    ]
    
    for selector in role_selectors:
        role_elem = container.select_one(selector)
        if role_elem:
            role_text = role_elem.get_text(strip=True)
            if len(role_text) > 2 and len(role_text) < 100:
                return role_text
    
    return None

def extract_employee_department(container):
    """Extract employee department"""
    # Look for department indicators in text
    container_text = container.get_text().lower()
    department_indicators = {
        'engineering': ['engineer', 'developer', 'software', 'technical'],
        'sales': ['sales', 'account executive', 'business development'],
        'marketing': ['marketing', 'growth', 'digital marketing'],
        'management': ['manager', 'director', 'vp', 'head of', 'chief'],
        'operations': ['operations', 'hr', 'human resources', 'recruiting']
    }
    
    for dept, keywords in department_indicators.items():
        if any(keyword in container_text for keyword in keywords):
            return dept.capitalize()
    
    return None

def extract_employee_bio(container):
    """Extract employee bio/description"""
    bio_selectors = [
        'p', '.bio', '.description', '.about',
        '[class*="bio"]', '[class*="description"]'
    ]
    
    for selector in bio_selectors:
        bio_elem = container.select_one(selector)
        if bio_elem:
            bio_text = bio_elem.get_text(strip=True)
            if len(bio_text) > 20 and len(bio_text) < 500:
                return bio_text
    
    return None

def extract_employee_social_links(container):
    """Extract employee social media links"""
    social_links = []
    social_platforms = ['linkedin', 'twitter', 'github', 'facebook', 'instagram']
    
    for link in container.find_all('a', href=True):
        href = link['href'].lower()
        for platform in social_platforms:
            if platform in href:
                social_links.append({
                    'platform': platform,
                    'url': link['href']
                })
                break
    
    return social_links

def extract_employee_photo(container):
    """Extract employee photo URL"""
    img_selectors = ['img', '.photo', '.avatar', '.profile-pic']
    
    for selector in img_selectors:
        img_elem = container.select_one(selector)
        if img_elem and img_elem.get('src'):
            src = img_elem['src']
            if not src.startswith('data:') and len(src) > 10:
                return src
    
    return None

def remove_duplicate_employees(employees):
    """Remove duplicate employees based on name and email"""
    unique_employees = []
    seen_combinations = set()
    
    for employee in employees:
        key = (employee.get('name', '').lower(), employee.get('email', ''))
        if key not in seen_combinations and employee.get('name'):
            unique_employees.append(employee)
            seen_combinations.add(key)
    
    return unique_employees





def smart_scrape_website(domain, timeout_seconds=30):
    """Smart scraping with timeout protection"""
    if is_social_platform(domain):
        return quick_scrape_social_platform(domain, timeout_seconds)
    else:
        return scrape_company_for_contacts_enhanced(domain)

def quick_scrape_social_platform(domain, timeout_seconds=30):
    """Fast scraping for social platforms with timeout protection"""
    def timeout_handler(signum, frame):
        raise TimeoutError("Scraping timeout")

    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(timeout_seconds)

    try:
        print(f"Quick scraping social platform: {domain}")
        result = {
            "domain": domain,
            "notes": "quick_social_scrape",
            "emails": set(),
            "phones": set(),
            "social_links": set(),
            "company_info": {},
            "employees": []
        }

        homepage = f"https://{domain}"
        resp = fetch_url(homepage)
        if resp and resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")
            emails = extract_emails_from_text(resp.text)
            phones = extract_phones_from_text(resp.text)
            result["emails"].update(emails)
            result["phones"].update(phones)
            result["company_info"] = extract_company_info(soup, domain)

            text = resp.text.lower()
            if any(keyword in text for keyword in ["team", "about", "leadership"]):
                result["employees"] = find_employees_from_website(domain)

        signal.alarm(0)
        return result

    except TimeoutError:
        print(f"Timeout scraping {domain} - social platform")
        return {"error": "timeout", "domain": domain}
    except Exception as e:
        print(f"Error quick scraping {domain}: {e}")
        return {"error": str(e), "domain": domain}
    finally:
        signal.alarm(0)

# ---------- Fixed SimpleCache ----------
class SimpleCache:
    def __init__(self, cache_dir: str = "cache"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(exist_ok=True)

    def _get_cache_file(self, key: str) -> Path:
        safe_key = re.sub(r'[^a-zA-Z0-9]', '_', key)
        return self.cache_dir / f"{safe_key}.json"

    def get(self, key: str) -> any:
        cache_file = self._get_cache_file(key)
        if cache_file.exists():
            try:
                with open(cache_file, 'r') as f:
                    data = json.load(f)
                cache_time = datetime.fromisoformat(data['timestamp'])
                if datetime.now() - cache_time < timedelta(hours=CONFIG['cache_ttl_hours']):
                    return data['value']
            except Exception as e:
                try:
                    cache_file.unlink()
                except:
                    pass
        return None

    def set(self, key: str, value: any):
        cache_file = self._get_cache_file(key)
        try:
            cleaned_value = self._clean_data(value)
            data = {
                'timestamp': datetime.now().isoformat(),
                'value': cleaned_value
            }
            with open(cache_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Cache write error for {key}: {e}")

    def _clean_data(self, obj):
        if obj is None:
            return None
        elif isinstance(obj, (str, int, float, bool)):
            return obj
        elif isinstance(obj, dict):
            return {k: self._clean_data(v) for k, v in obj.items()}
        elif isinstance(obj, (list, tuple, set)):
            return [self._clean_data(item) for item in obj]
        elif hasattr(obj, '__dict__'):
            return self._clean_data(obj.__dict__)
        else:
            return str(obj)

# ---------- Rate Limiting Decorator ----------
def rate_limited(func):
    def wrapper(*args, **kwargs):
        delay = random.uniform(*CONFIG['rate_limit_delay'])
        time.sleep(delay)
        return func(*args, **kwargs)
    return wrapper

# ---------- Enhanced Email Validation ----------
class EmailValidator:
    def __init__(self, cache: SimpleCache):
        self.cache = cache

    def validate_email(self, email: str) -> Dict:
        cached = self.cache.get(f"email_{email}")
        if cached:
            return cached

        result = {
            'email': email,
            'is_valid': False,
            'score': 0,
            'dns_valid': False,
            'details': {}
        }

        try:
            # 1. Basic syntax validation
            v = validate_email(email, check_deliverability=False)  # Faster without SMTP
            result['is_valid'] = True
            result['score'] += 40
            
            # 2. DNS validation (FAST and reliable)
            domain = email.split('@')[1]
            try:
                # Check MX records (email delivery)
                mx_records = dns.resolver.resolve(domain, 'MX')
                result['dns_valid'] = True
                result['score'] += 40
                result['details']['mx_records'] = len(mx_records)
                print(f"✅ DNS valid: {domain} has {len(mx_records)} MX records")
            except dns.resolver.NoAnswer:
                result['details']['dns_error'] = "No MX records"
                result['score'] += 10  # Still give some points
            except dns.resolver.NXDOMAIN:
                result['details']['dns_error'] = "Domain doesn't exist"
            except Exception as e:
                result['details']['dns_error'] = str(e)

        except EmailNotValidError as e:
            result['details']['error'] = str(e)

        # Only accept emails with decent scores
        result['is_valid'] = result['is_valid'] and result['score'] >= 50
        
        self.cache.set(f"email_{email}", result)
        return result

    

# ---------- ENHANCED LinkedIn Lead Generator ----------
class LinkedInLeadGenerator:
    def __init__(self):
        self.cache = SimpleCache()
        self.email_validator = EmailValidator(self.cache)
        self.used_user_agents = set()



    @rate_limited
    def search_linkedin_profiles(self, query: str, max_results: int = 50) -> List[Dict]:
        try:
            print(f"Searching: {query}")
            with DDGS() as ddgs:
                results = list(ddgs.text(query, max_results=max_results))
                print(f"Found {len(results)} results")
                return results
        except Exception as e:
            print(f"Search error: {e}")
            return []

    # FIXED: Enhanced profile parsing with location and industry extraction
    def parse_profile_enhanced(self, title: str, snippet: str, url: str) -> Dict:
        """Enhanced profile parsing that extracts contacts, location, and industry"""

        try:
            # Clean title (existing code)
            title = title.replace("| LinkedIn", "").strip()
            title = re.sub(r'\s{2,}', ' ', title)
            title = re.sub(r"\.\.\..*", "", title)

            # Extract name (existing code)
            name_match = re.search(r'^([A-Za-z\s\.\-]+?)(?:\s*[-–—]\s*|\s+at\s+|\s*\|)', title)
            if name_match:
                name = name_match.group(1).strip()
            else:
                name = re.split(r'[-–—]|\bat\b', title)[0].strip()

            # Extract job title and company with enhanced extraction
            job_title, company = self._extract_title_company_enhanced(title, snippet)

            # EXTRACT LOCATION from snippet
            location = self.extract_location_from_snippet(snippet)

            # EXTRACT INDUSTRY from title and snippet
            industry = self.extract_industry_from_text(title, snippet)

            # EXTRACT CONTACTS FROM SEARCH RESULTS
            search_contacts = self.extract_contacts_from_search_text(title, snippet, url)

            return {
                "name": name,
                "job_title": job_title,
                "company": company,
                "location": location,  # NEW
                "industry": industry,  # NEW
                "url": url,
                "timestamp": datetime.now().isoformat(),
                "search_emails": search_contacts["emails"],
                "search_phones": search_contacts["phones"],
                "search_contacts_source": "search_snippet"
            }
        except Exception as e:
            print(f"Error parsing profile: {e}")
            # Return minimal profile data
            return {
                "name": "Unknown",
                "job_title": None,
                "company": None,
                "location": None,
                "industry": None,
                "url": url,
                "timestamp": datetime.now().isoformat(),
                "search_emails": [],
                "search_phones": [],
                "search_contacts_source": "error"
            }

    def extract_location_from_snippet(self, snippet: str) -> Optional[str]:
        """Extract location from LinkedIn snippet"""
        if not snippet:
            return None

        # Common location patterns in LinkedIn snippets
        location_patterns = [
            r'(\b[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*\s*,\s*[A-Z]{2}\b)',  # "City, ST"
            r'(\b[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*\s*,\s*[A-Z][a-z]+\b)',  # "City, Country"
            r'(\b(?:Greater\s+)?[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*\s*(?:Area|Region)\b)',  # "Bay Area"
            r'(\b[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*\s*[A-Z]{2}\b)',  # "City ST"
        ]

        for pattern in location_patterns:
            match = re.search(pattern, snippet)
            if match:
                location = match.group(1).strip()
                # Filter out common false positives
                if not any(false_positive in location.lower() for false_positive in
                          ['linkedin', 'connections', 'followers', 'profile']):
                    return location

        return None

    def extract_industry_from_text(self, title: str, snippet: str) -> Optional[str]:
        """Extract industry from title and snippet"""
        combined_text = f"{title} {snippet}".lower()

        # Common industries that appear in LinkedIn profiles
        industries = {
            'technology': ['tech', 'software', 'it', 'saas', 'cloud', 'ai', 'artificial intelligence'],
            'finance': ['finance', 'banking', 'investment', 'fintech', 'wealth management'],
            'healthcare': ['healthcare', 'medical', 'pharmaceutical', 'biotech', 'hospital'],
            'manufacturing': ['manufacturing', 'industrial', 'production', 'engineering'],
            'retail': ['retail', 'e-commerce', 'consumer goods', 'fashion'],
            'energy': ['energy', 'oil', 'gas', 'renewable', 'solar', 'wind'],
            'education': ['education', 'edtech', 'university', 'learning'],
            'real estate': ['real estate', 'property', 'construction'],
            'marketing': ['marketing', 'advertising', 'digital marketing', 'brand'],
            'consulting': ['consulting', 'consultant', 'advisory']
        }

        for industry, keywords in industries.items():
            if any(keyword in combined_text for keyword in keywords):
                return industry

        return None

    def _extract_title_company_enhanced(self, title: str, snippet: str) -> tuple:
      """Enhanced company and title extraction - FIXED"""
      print(f"  🔍 DEBUG Company Extraction:")
      print(f"     Title: {title}")
      print(f"     Snippet: {snippet[:200]}...")  # Only first 200 chars

      job_title = None
      company = None

      # Extract from title first (most reliable)
      title_patterns = [
          r'^([A-Za-z\s\-]+)\s+-\s+(.+?)\s+at\s+([A-Za-z0-9&.\-\s]+)',  # "Name - Title at Company"
          r'^([A-Za-z\s\-]+)\s+-\s+(.+?)\s+@\s+([A-Za-z0-9&.\-\s]+)',   # "Name - Title @ Company"
          r'^([A-Za-z\s\-]+)\s+-\s+([^·]+)·\s+([A-Za-z0-9&.\-\s]+)',    # "Name - Title · Company"
      ]

      for pattern in title_patterns:
          match = re.search(pattern, title)
          if match:
              name = match.group(1).strip()
              job_title = match.group(2).strip()
              company = match.group(3).strip()
              print(f"     ✅ EXTRACTED from title: {job_title} at {company}")
              break

      # If no company found in title, try snippet
      if not company:
          snippet_patterns = [
              r'Experience:\s*([A-Za-z0-9&.\-\s]+?)(?:\s*·|\.|$)',
              r'at\s+([A-Za-z0-9&.\-\s]+?)(?:\s*·|\.|$)',
          ]

          for pattern in snippet_patterns:
              match = re.search(pattern, snippet)
              if match:
                  company = match.group(1).strip()
                  print(f"     ✅ EXTRACTED from snippet: {company}")
                  break

      # Clean company name
      if company:
          # Remove common suffixes and clean up
          company = re.sub(r'[·|]\s*$', '', company).strip()
          company = re.sub(r'\s+', ' ', company)

          # Filter out obviously wrong companies
          if len(company) < 2 or company in ['LinkedIn', 'Experience', 'Location']:
              company = None

      print(f"     Final -> Job: {job_title}, Company: {company}")
      return job_title, company

    def extract_contacts_from_search_text(self, title: str, snippet: str, url: str) -> Dict:
        """More aggressive contact extraction from search results"""
        combined_text = f"{title} {snippet}"

        contacts = {
            "emails": [],
            "phones": []
        }

        # Extract ALL emails (not just personal ones)
        email_matches = EMAIL_REGEX.findall(combined_text)
        for email in email_matches:
            if self.is_valid_email(email):
                contacts["emails"].append({
                    "email": email.strip(),
                    "source": "search_snippet",
                    "source_url": url,
                    "score": 85,
                    "type": "personal" if any(domain in email for domain in ['gmail', 'yahoo', 'hotmail']) else "professional"
                })

        # FIXED: Phone extraction that handles tuple groups properly
        phone_matches = PHONE_REGEX.findall(combined_text)
        for match in phone_matches:
            # Handle tuple matches - take the first non-None group
            if isinstance(match, tuple):
                phone = next((group for group in match if group is not None), None)
            else:
                phone = match

            if phone:
                # Clean phone number
                clean_phone = self.clean_phone_number(phone)
                if self.validate_phone_format(clean_phone):
                    contacts["phones"].append({
                        "phone": clean_phone,
                        "source": "search_snippet",
                        "source_url": url,
                        "type": self.classify_phone_type(clean_phone)
                    })

        return contacts

    def is_valid_email(self, email: str) -> bool:
        """Check if email is valid (less restrictive)"""
        # ADD THIS CHECK FIRST:
        if email is None or not isinstance(email, str):
            return False

        invalid_keywords = ['example', 'test', 'admin@example']
        if any(keyword in email.lower() for keyword in invalid_keywords):
            return False

        try:
            validate_email(email)
            return True
        except EmailNotValidError:
            return False

    def clean_phone_number(self, phone: str) -> str:
        """Clean and standardize phone number format"""
        if not phone:
            return ""

        # Remove common separators but keep + for country codes
        cleaned = re.sub(r'[^\d+]', '', phone)

        # Remove "tel:", "phone:", "mobile:" prefixes
        cleaned = re.sub(r'^(tel|phone|mobile)[:\s]*', '', cleaned, flags=re.IGNORECASE)

        # Handle common patterns
        if cleaned.startswith('+'):
            return cleaned
        elif len(cleaned) == 10 and not cleaned.startswith('0'):
            return f"+1{cleaned}"  # Assume US if no country code
        elif len(cleaned) == 11 and cleaned.startswith('1'):
            return f"+{cleaned}"
        else:
            return cleaned

    def validate_phone_format(self, phone: str) -> bool:
        """Validate phone number format - STRICTER validation"""
        if not phone or len(phone) < 10:
            return False

        # Remove + for digit counting
        digits_only = re.sub(r'[^\d]', '', phone)

        # Must have reasonable digit count (international: 10-15, local: 10)
        if len(digits_only) < 10 or len(digits_only) > 15:
            return False

        # Should not be just repeating digits or simple sequences
        if len(set(digits_only)) < 4:  # Too few unique digits
            return False

        # Check for common invalid patterns (years, zip codes, etc.)
        invalid_patterns = [
            r'^\d{4}$',  # 4-digit years
            r'^\d{5}$',  # zip codes
            r'^\d{6}$',  # short codes
            r'^1234567890$',  # sequence
            r'^1111111111$',  # repeating
        ]

        for pattern in invalid_patterns:
            if re.match(pattern, digits_only):
                return False

        return True

    def classify_phone_type(self, phone: str) -> str:
        """Classify phone number type"""
        # For now, keep it simple - we'll enhance this later
        return "unknown"


    def should_process_profile(self, profile: Dict) -> bool:
        """More lenient profile filtering - WITH DEBUG INFO"""
        name = profile.get('name', '').strip()



        if not name or len(name) < 2 or name == "Unknown":
            print(f"     ❌ REJECTED: Invalid name '{name}'")
            return False

        # Check what data we actually have
        has_company = bool(profile.get('company'))
        has_search_contacts = bool(profile.get('search_emails') or profile.get('search_phones'))
        has_job_title = bool(profile.get('job_title'))
        has_location = bool(profile.get('location'))
        has_industry = bool(profile.get('industry'))


        # Accept if we have ANY valuable data
        should_process = has_company or has_search_contacts or has_job_title or has_location or has_industry

        if not should_process:
            print(f"     ❌ REJECTED: No valuable data found")
        else:
            print(f"     ✅ ACCEPTED: Has sufficient data")

        return should_process

    def enhanced_contact_discovery(self, profile):
        print(f"  🐛 DEBUG: Starting contact discovery for {profile.get('name')}")
        profile.setdefault("domain", None)
        all_contacts = []
        all_phones = []

        try:
            # Get location and industry from profile
            location = profile.get("location")
            industry = profile.get("industry")

            print(f"  🐛 DEBUG: Step 1 - Search contacts")
            # 1. CONTACTS FROM SEARCH RESULTS
            if profile.get('search_emails'):
                for i, email_data in enumerate(profile['search_emails']):
                    print(f"  🐛 DEBUG: Validating search email {i}: {email_data.get('email')}")
                    try:
                        validated = self.email_validator.validate_email(email_data['email'])
                        if validated['is_valid']:
                            all_contacts.append({
                                **email_data,
                                **validated,
                                "score": email_data.get('score', 85)
                            })
                    except Exception as e:
                        print(f"  🐛 DEBUG: ERROR validating search email: {e}")
                        print(f"  🐛 DEBUG: Email data: {email_data}")
                        continue

            print(f"  🐛 DEBUG: Step 2 - Domain discovery")
            # 2. DOMAIN-BASED CONTACTS - ONLY if company exists
            company = profile.get("company")
            if company:  # FIX: Only try domain discovery if we have a company
                domain = self.get_company_domain(company, location, industry)
                profile["domain"] = domain

                if domain:
                    # Email patterns from domain
                    if profile["name"] and profile["name"] != "Unknown":
                        email_patterns = self.generate_email_patterns(profile["name"], domain)
                        validated_emails = self.validate_emails(email_patterns)
                        for email in validated_emails:
                            email["source"] = "pattern_generation"
                            email["source_url"] = f"Generated from {domain}"
                        all_contacts.extend(validated_emails)

                    # Scrape website for contacts
                    scraped_contacts = self.scrape_company_contacts(domain)

                    if "employees" in scraped_contacts:
                        profile["website_employees"] = scraped_contacts["employees"]
                        print(f"     Found {len(scraped_contacts['employees'])} employees from website")
                    
                    if "company_info" in scraped_contacts:
                        profile["company_info"] = scraped_contacts["company_info"]
                        print(f"     Found company info: {scraped_contacts['company_info']}")
                    
                    if "social_links" in scraped_contacts:
                        profile["company_social_links"] = scraped_contacts["social_links"]
                    
                    if "contact_forms" in scraped_contacts:
                        profile["website_contact_forms"] = scraped_contacts["contact_forms"]
                    all_contacts.extend(scraped_contacts.get("validated_emails", []))

                    # Extract VALID phones from website
                    website_phones = scraped_contacts.get('phones', [])
                    for phone in website_phones:
                        clean_phone = self.clean_phone_number(phone)
                        if self.validate_phone_format(clean_phone):
                            all_phones.append({
                                "phone": clean_phone,
                                "source": "website_scraping",
                                "source_url": domain,
                                "type": self.classify_phone_type(clean_phone)
                            })
                else:
                    print(f"  No valid domain found for: {company}")
            else:
                print(f"  No company found for domain discovery")

            # 3. DIRECT SEARCH & DIRECTORIES (UPDATED: pass location/industry)
            if profile["name"] and profile["name"] != "Unknown" and profile.get("company"):
                # UPDATED: Pass location to direct email search
                direct_emails = find_emails_without_domain(profile["company"], profile["name"], location)
                email_addresses = [contact["email"] for contact in direct_emails]
                validated_direct_emails = self.validate_emails(email_addresses)

                for validated_email in validated_direct_emails:
                    for direct_contact in direct_emails:
                        if direct_contact["email"] == validated_email["email"]:
                            validated_email["source"] = direct_contact["source"]
                            validated_email["source_url"] = direct_contact["source_url"]
                            validated_email["score"] = direct_contact["score"]
                            break
                all_contacts.extend(validated_direct_emails)

                # UPDATED: Pass location/industry to business directories
                directory_contacts = search_business_directories(profile["company"], location, industry)
                directory_emails = [contact["email"] for contact in directory_contacts]
                validated_directory_emails = self.validate_emails(directory_emails)

                for validated_email in validated_directory_emails:
                    for directory_contact in directory_contacts:
                        if directory_contact["email"] == validated_email["email"]:
                            validated_email["source"] = directory_contact["source"]
                            validated_email["source_url"] = directory_contact["source_url"]
                            validated_email["score"] = directory_contact["score"]
                            break
                all_contacts.extend(validated_directory_emails)

            # Remove duplicates
            unique_contacts = self.remove_duplicate_contacts(all_contacts)
            unique_phones = self.remove_duplicate_phones(all_phones)

            profile["all_emails"] = unique_contacts
            profile["phone_numbers"] = unique_phones

            return unique_contacts
        except Exception as e:
            print(f"  🐛 DEBUG: MAJOR ERROR in contact discovery: {e}")
            import traceback
            traceback.print_exc()
            return []

    def remove_duplicate_contacts(self, contacts: List[Dict]) -> List[Dict]:
        """Remove duplicate contacts while preserving highest score"""
        email_map = {}

        for contact in contacts:
            email = contact['email'].lower()
            if email not in email_map or contact.get('score', 0) > email_map[email].get('score', 0):
                email_map[email] = contact

        return list(email_map.values())

    def remove_duplicate_phones(self, phones: List[Dict]) -> List[Dict]:
        """Remove duplicate phone numbers"""
        phone_map = {}

        for phone_data in phones:
            clean_phone = self.clean_phone_number(phone_data['phone'])
            if clean_phone not in phone_map:
                phone_map[clean_phone] = phone_data

        return list(phone_map.values())

    @rate_limited
    def get_company_domain(self, company_name: str, location: str = None, industry: str = None) -> Optional[str]:
        # Known domain overrides for common companies
        known_domains = {
            'rolls-royce': 'rolls-royce.com',
            'google': 'google.com',
            'stellantis': 'stellantis.com',
            'ecolab': 'ecolab.com',
            'caterpillar': 'caterpillar.com',
            'linkedin': 'linkedin.com',
        }

        company_lower = company_name.lower()
        for known_company, domain in known_domains.items():
            if known_company in company_lower:
                print(f"  ✅ Using known domain: {domain} for {company_name}")
                return domain


        if not company_name:
            return None

        if len(company_name.strip()) < 2:
            return None

        cached_domain = self.cache.get(f"domain_{company_name}")
        if cached_domain:
            return cached_domain

        # ENHANCED: Use REAL location and industry if available
        domain = find_company_website_advanced(company_name, location, industry)

        # Fallback: Try domain guessing
        if not domain:
            domain = guess_common_domains(company_name)

        if domain:
            self.cache.set(f"domain_{company_name}", domain)
            print(f"Found domain: {domain} for {company_name}")

            # Show if location/industry helped
            if location or industry:
                help_sources = []
                if location:
                    help_sources.append(f"location: {location}")
                if industry:
                    help_sources.append(f"industry: {industry}")
                print(f"  🔍 Assisted by: {', '.join(help_sources)}")
        else:
            print(f"No valid domain found for: {company_name}")

        return domain

    def generate_email_patterns(self, name: str, domain: str) -> List[str]:
        if not name or not domain:
            return []

        name = re.sub(r'[^a-zA-Z\s]', '', name).strip()
        if not name:
            return []

        parts = name.lower().split()

        if len(parts) < 2:
            return []

        first, last = parts[0], parts[-1]
        first = re.sub(r'^(dr|mr|ms|mrs)\.?', '', first).strip()

        if not first or not last:
            return []

        patterns = []

        try:
            if len(first) > 0 and len(last) > 0:
                patterns.extend([
                    f"{first}.{last}@{domain}",
                    f"{first}{last}@{domain}",
                ])

            if len(first) > 0:
                patterns.append(f"{first}@{domain}")

            if len(last) > 0:
                patterns.append(f"{last}@{domain}")

            if len(first) > 0 and len(last) > 0:
                patterns.extend([
                    f"{first[0]}{last}@{domain}",
                    f"{first}{last[0]}@{domain}",
                    f"{first[0]}.{last}@{domain}",
                ])

        except IndexError as e:
            patterns = [
                f"{first}.{last}@{domain}",
                f"{first}{last}@{domain}",
                f"{first}@{domain}",
                f"{last}@{domain}",
            ]

        valid_patterns = []
        for pattern in patterns:
            if '@' in pattern and len(pattern) > 5 and pattern.count('@') == 1:
                local_part = pattern.split('@')[0]
                if local_part and not local_part.startswith('.') and not local_part.endswith('.'):
                    valid_patterns.append(pattern)

        return list(set(valid_patterns))

    def validate_emails(self, emails: List[str]) -> List[Dict]:
        if not emails:
            return []

        validated = []
        for email in emails:
            try:
                result = self.email_validator.validate_email(email)
                if result['is_valid'] and result['score'] > 50:
                    validated.append(result)
            except Exception as e:
                print(f"Error validating email {email}: {e}")
                continue

        return sorted(validated, key=lambda x: x['score'], reverse=True)

    def scrape_company_contacts(self, domain: str) -> Dict:
        cached = self.cache.get(f"scraped_{domain}")
        if cached:
            return cached

        print(f"Scraping company website: {domain}")
        try:
            scraped_data = smart_scrape_website(domain)

            if "error" in scraped_data:
                return scraped_data

            validated_scraped_emails = []
            for email_data in scraped_data.get("emails_list", []):
                try:
                    validation = self.email_validator.validate_email(email_data["email"])
                    if validation['is_valid']:
                        validated_scraped_emails.append({
                            **email_data,
                            **validation,
                            "source": "website_scraping",
                            "source_url": scraped_data.get("root_url", domain)
                        })
                except Exception as e:
                    print(f"Error validating scraped email {email_data['email']}: {e}")
                    continue

            scraped_data["validated_emails"] = sorted(validated_scraped_emails, key=lambda x: x['score'], reverse=True)

            self.cache.set(f"scraped_{domain}", scraped_data)
            return scraped_data
        except Exception as e:
            print(f"Error scraping {domain}: {e}")
            return {"error": str(e), "validated_emails": []}

    def generate_leads_enhanced(self, queries: List[str], max_leads: int = 20) -> List[Dict]:
        all_leads = []

        for query in queries:
            print(f"\n=== Processing query: {query} ===")

            search_results = self.search_linkedin_profiles(query, max_leads)
            print(f"Found {len(search_results)} search results")

            processed_count = 0
            for i, result in enumerate(search_results):
                print(f"Processing result {i+1}/{len(search_results)}...")

                try:
                    # Use enhanced profile parsing with error handling
                    profile = self.parse_profile_enhanced(result["title"], result["body"], result["href"])

                    if self.should_process_profile(profile):
                        # Enhanced contact discovery with phones
                        contacts = self.enhanced_contact_discovery(profile)
                        profile["lead_score"] = self.calculate_enhanced_lead_score(profile)

                        all_leads.append(profile)
                        processed_count += 1

                        print(f"✓ Processed {processed_count}/{len(search_results)} - {profile['name']}")
                        if profile.get('search_emails'):
                            print(f"  Found {len(profile['search_emails'])} emails in search snippet")
                        if profile.get('search_phones'):
                            print(f"  Found {len(profile['search_phones'])} phones in search snippet")
                    else:
                        print(f"✗ Skipped {profile.get('name', 'Unknown')} - insufficient data")

                    time.sleep(random.uniform(1, 2))

                except Exception as e:
                    print(f"❌ Error processing profile: {e}")
                    continue

            if len(queries) > 1:
                time.sleep(random.uniform(5, 10))

        print(f"\n🎯 Final: {len(all_leads)} leads processed from {len(search_results)} results")
        return sorted(all_leads, key=lambda x: x['lead_score'], reverse=True)

    def calculate_enhanced_lead_score(self, profile: Dict) -> int:
        score = 0

        # Base scores
        if profile.get('company'):
            score += 20
        if profile.get('domain'):
            score += 20
        if profile.get('job_title'):
            score += 10

        # ADDED: Location and industry scoring
        if profile.get('location'):
            score += 5
        if profile.get('industry'):
            score += 5

        # Email scoring
        all_emails = profile.get("all_emails", [])
        if all_emails:
            best_email = max(all_emails, key=lambda x: x.get('score', 0))
            score += min(best_email.get('score', 0), 40)
            if len(all_emails) > 1:
                score += 5

        # Phone scoring
        phone_numbers = profile.get("phone_numbers", [])
        if phone_numbers:
            score += 20
            if len(phone_numbers) > 1:
                score += 5
            if any(p.get('type') == 'mobile' for p in phone_numbers):
                score += 10

        # Search contacts bonus
        if profile.get('search_emails') or profile.get('search_phones'):
            score += 15

        return min(score, 100)




  
    def _clean_lead_data(self, lead):
        """Enhanced data cleaning for JSON serialization"""
        if not isinstance(lead, dict):
            return str(lead) if lead is not None else None

        cleaned = {}
        for key, value in lead.items():
            try:
                if value is None:
                    cleaned[key] = None
                elif isinstance(value, (str, int, float, bool)):
                    cleaned[key] = value
                elif isinstance(value, (list, tuple, set)):
                    # Recursively clean each item in the list
                    cleaned_list = []
                    for item in value:
                        if isinstance(item, (str, int, float, bool)):
                            cleaned_list.append(item)
                        elif isinstance(item, dict):
                            cleaned_list.append(self._clean_lead_data(item))
                        elif isinstance(item, (list, tuple, set)):
                            cleaned_list.append([self._clean_lead_data(sub_item) for sub_item in item])
                        else:
                            cleaned_list.append(str(item) if item is not None else None)
                    cleaned[key] = cleaned_list
                elif isinstance(value, dict):
                    cleaned[key] = self._clean_lead_data(value)
                elif hasattr(value, 'isoformat'):  # Handle datetime objects
                    cleaned[key] = value.isoformat()
                else:
                    cleaned[key] = str(value) if value is not None else None
            except Exception as e:
                print(f"Warning: Could not clean key '{key}': {e}")
                cleaned[key] = None
        
        return cleaned
# ---------- Flask Blueprint Setup ----------
lead_generator_bp = Blueprint('lead_generator', __name__)

@lead_generator_bp.route('/generate-leads', methods=['POST'])
def generate_leads_endpoint():
    try:
        data = request.get_json()
        
        query = data.get('query', '')
        max_leads = data.get('max_leads', 10)
        
        if not query:
            return jsonify({"error": "Query parameter is required"}), 400
        
        print(f"🔍 Received query: {query}")
        print(f"📊 Max leads requested: {max_leads}")
        
        lead_generator = LinkedInLeadGenerator()
        queries = [query]
        
        leads = lead_generator.generate_leads_enhanced(queries, max_leads)
        
        # Ensure all leads are properly serialized
        serialized_leads = []
        for lead in leads:
            try:
                serialized_lead = lead_generator._clean_lead_data(lead)
                
                # Ensure all expected fields are present
                required_fields = [
                    'name', 'company', 'job_title', 'location', 'industry', 
                    'domain', 'url', 'lead_score', 'all_emails', 'phone_numbers',
                    'search_emails', 'search_phones', 'website_employees', 'company_info',
                    'company_social_links', 'website_contact_forms'
                ]

                for field in required_fields:
                    if field not in serialized_lead:
                        if field in ['location', 'industry', 'domain', 'job_title', 'company']:
                            serialized_lead[field] = None
                        elif field == 'company_info':
                            serialized_lead[field] = {}
                        else:
                            serialized_lead[field] = []
                serialized_leads.append(serialized_lead)
            except Exception as e:
                print(f"Warning: Could not serialize lead: {e}")
                continue
        
        # Build comprehensive response
        # Modify your response to include missing data
        response_data = {
            "status": "success",
            "generated_at": datetime.now().isoformat(),
            "input_parameters": {
                "query": query,
                "max_leads": max_leads
            },
            "total_leads": len(serialized_leads),
            "leads": serialized_leads,
            "summary": {
                "total_leads": len(serialized_leads),
                "leads_with_emails": len([l for l in serialized_leads if l.get('all_emails')]),
                "leads_with_phones": len([l for l in serialized_leads if l.get('phone_numbers')]),
                "leads_with_location": len([l for l in serialized_leads if l.get('location')]),
                "leads_with_industry": len([l for l in serialized_leads if l.get('industry')]),
                "leads_with_company": len([l for l in serialized_leads if l.get('company')]),
                "leads_with_job_title": len([l for l in serialized_leads if l.get('job_title')])
            },
            "data_breakdown": {
                "emails_found": sum(len(l.get('all_emails', [])) for l in serialized_leads),
                "phones_found": sum(len(l.get('phone_numbers', [])) for l in serialized_leads),
                "search_emails_found": sum(len(l.get('search_emails', [])) for l in serialized_leads),
                "search_phones_found": sum(len(l.get('search_phones', [])) for l in serialized_leads)
            },
          
        }
        
        print(f"✅ Successfully processed {len(serialized_leads)} leads")
        return jsonify(response_data)
        
    except Exception as e:
        print(f"❌ Error generating leads: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "error": str(e),
            "generated_at": datetime.now().isoformat()
        }), 500


@lead_generator_bp.route('/scrape-events', methods=['POST'])
def scrape_events_endpoint():
    """
    Scrapes worldwide events from DuckDuckGo and extracts attendee information
    
    Request body:
    {
        "event_name": "string (required)",
        "time_filter": "all|month|week|day (optional, default: all)"
    }
    """
    try:
        data = request.get_json() or {}
        event_name = data.get('event_name', '').strip()
        time_filter = data.get('time_filter', 'all')
        
        if not event_name:
            return jsonify({
                "status": "error",
                "message": "event_name parameter is required"
            }), 400
        
        # Validate time_filter
        valid_filters = ['all', 'month', 'week', 'day']
        if time_filter not in valid_filters:
            time_filter = 'all'
        
        print(f"🔎 Scraping events for: {event_name} (time_filter: {time_filter})")
        
        # Use DDGS to search for events
        try:
            ddgs = DDGS(timeout=10)
            search_query = f"{event_name} event conference summit"
            results = ddgs.text(search_query, max_results=20)
        except Exception as e:
            print(f"DDGS search error: {e}")
            results = []
        
        # Parse results to extract event information
        events = []
        seen_titles = set()
        
        for result in results:
            if len(events) >= 15:  # Limit to 15 events
                break
            
            title = result.get('title', '').strip()
            body = result.get('body', '').strip()
            href = result.get('href', '')
            
            # Avoid duplicates
            if title in seen_titles:
                continue
            seen_titles.add(title)
            
            # Try to extract event details using Gemini AI
            event_info = {
                'title': title,
                'description': body[:300] if body else '',
                'url': href,
                'source': 'Web Search',
                'contacts': [],
                'metadata': {
                    'extracted_date': datetime.now().isoformat(),
                    'time_filter': time_filter
                }
            }
            
            # Extract emails and phone numbers from description
            emails_in_body = EMAIL_REGEX.findall(body) if body else []
            phones_in_body = []
            
            if body:
                phone_matches = PHONE_REGEX.findall(body)
                for match_tuple in phone_matches:
                    # match_tuple is a tuple of groups; find the non-empty one
                    for group in match_tuple:
                        if group:
                            phones_in_body.append(group)
                            break
            
            # Add unique contacts
            if emails_in_body:
                for email in list(set(emails_in_body))[:3]:  # Max 3 emails per event
                    event_info['contacts'].append({
                        'type': 'email',
                        'value': email
                    })
            
            if phones_in_body:
                for phone in list(set(phones_in_body))[:2]:  # Max 2 phones per event
                    event_info['contacts'].append({
                        'type': 'phone',
                        'value': phone
                    })
            
            # Try to extract location from title/description
            location_hints = ['in', 'at', 'conference', 'summit', 'workshop']
            location_text = title
            if any(hint in title.lower() for hint in location_hints):
                location_text = title
            elif any(hint in body.lower() for hint in location_hints):
                location_text = body[:200]
            
            event_info['metadata']['location_hint'] = location_text
            
            events.append(event_info)
        
        response = {
            "status": "success" if events else "no_results",
            "message": f"Found {len(events)} events for '{event_name}'",
            "event_name": event_name,
            "time_filter": time_filter,
            "events": events,
            "total_events": len(events),
            "generated_at": datetime.now().isoformat()
        }
        
        if not events:
            response["message"] = f"No events found for '{event_name}'. Try a different search term."
        
        return jsonify(response), 200
        
    except Exception as e:
        print(f"❌ Error scraping events: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": str(e),
            "generated_at": datetime.now().isoformat()
        }), 500

@lead_generator_bp.route('/discover-events', methods=['POST'])
def discover_events_endpoint():
    """
    Lightweight event discovery for GoogleScraperTab (search mode).
    Returns a normalized structure with events list expected by the frontend.

    Request body JSON: { "query": "<search terms>" }
    """
    try:
        payload = request.get_json() or {}
        query = (payload.get('query') or '').strip()
        if not query:
            return jsonify({"error": "Query required"}), 400

        events = []
        sources_used = []

        try:
            ddgs = DDGS(timeout=10)
            results = ddgs.text(f"{query} conference event summit expo", max_results=10)
        except Exception as e:
            print(f"DDGS error in discover-events: {e}")
            results = []

        seen = set()
        for item in results:
            title = (item.get('title') or '').strip()
            desc = (item.get('body') or '').strip()
            href = item.get('href') or ''
            if not title or href in seen:
                continue
            seen.add(href)
            sources_used.append(href)

            # Simple heuristics for location/date extraction placeholders
            now = datetime.now()
            event_obj = {
                "event_overview": {
                    "name": title,
                    "description": desc[:280] if desc else "",
                    "event_type": "Conference",
                    "start_date": now.strftime('%Y-%m-%d'),
                    "end_date": (now.replace(hour=0, minute=0, second=0) ).strftime('%Y-%m-%d'),
                    "status": "Upcoming",
                    "location": "TBD",
                    "city_country": ""
                },
                "official_links": {
                    "official_website": href
                },
                "confidence": {
                    "score": 65,
                    "sources": [href]
                },
                "participants": []
            }
            events.append(event_obj)

            if len(events) >= 8:
                break

        return jsonify({
            "events": events,
            "total": len(events),
            "query": query,
            "generated_at": datetime.now().isoformat()
        })
    except Exception as e:
        print(f"❌ Event Discovery Error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

        
# ---------- Flask Application Setup ----------
def create_app():
    app = Flask(__name__)

    # Register blueprint
    app.register_blueprint(lead_generator_bp, url_prefix='/api')

    # CORS support (add this if you need cross-origin requests)
    @app.after_request
    def after_request(response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        return response

    return app

# ---------- Main Execution (for standalone testing) ----------
if __name__ == "__main__":
    app = create_app()

    
    app.run(debug=True, host='0.0.0.0', port=5000)