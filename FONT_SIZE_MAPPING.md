# Font-Size Analysis & Reduction Mapping
## Frontend CSS Components Directory

### Summary Statistics
- **Total CSS Files Analyzed**: 23 files
- **Total Font-Size Declarations Found**: 200+
- **Unique Values Found**: 35+ different sizes

---

## Font-Size Values Currently Used & Reduction Mapping

### REM Units (Relative)

| Current | Recommended | Used In Files |
|---------|-------------|---------------|
| **0.65rem** | 0.58rem | SummaryDashboard.css |
| **0.7rem** | 0.63rem | SummaryDashboard.css, RBACManager.css |
| **0.75rem** | 0.68rem | SummaryDashboard.css |
| **0.78rem** | 0.70rem | SummaryDashboard.css |
| **0.8rem** | 0.72rem | ZohoCRMTab.css, RBACManager.css |
| **0.85rem** | 0.77rem | ZohoCRMTab.css, SummaryDashboard.css, RBACManager.css |
| **0.9rem** | 0.8rem | ZohoCRMTab.css, WebScrapingTab.css, RBACManager.css, PageHeader.css |
| **0.95rem** | 0.85rem | ZohoCRMTab.css, WebScrapingTab.css, SummaryDashboard.css, RBACManager.css, PageHeader.css |
| **1rem** | 0.9rem | ZohoCRMTab.css, WebScrapingTab.css, RBACManager.css, SummaryDashboard.css |
| **1.1rem** | 0.95rem | ZohoCRMTab.css, WebScrapingTab.css, RBACManager.css |
| **1.2rem** | 1.05rem | ZohoCRMTab.css, WebScrapingTab.css, RBACManager.css |
| **1.25rem** | 1.1rem | SummaryDashboard.css |
| **1.3rem** | 1.1rem | ZohoCRMTab.css, WebScrapingTab.css, RBACManager.css |
| **1.4rem** | 1.2rem | ZohoCRMTab.css, WebScrapingTab.css |
| **1.45rem** | 1.3rem | SummaryDashboard.css |
| **1.5rem** | 1.3rem | ZohoCRMTab.css, RBACManager.css, PageHeader.css |
| **1.6rem** | 1.4rem | WebScrapingTab.css, SplashScreen.css |
| **1.8rem** | 1.6rem | ZohoCRMTab.css, WebScrapingTab.css |
| **1.875rem** | 1.7rem | PageHeader.css |
| **2rem** | 1.8rem | ZohoCRMTab.css, RBACManager.css |
| **2.1rem** | 1.9rem | SplashScreen.css |
| **2.2rem** | 2rem | WebScrapingTab.css |
| **2.5rem** | 2.25rem | ZohoCRMTab.css |
| **3rem** | 2.7rem | RBACManager.css |
| **3.2rem** | 2.9rem | SplashScreen.css |

### EM Units (Relative)

| Current | Recommended | Used In Files |
|---------|-------------|---------------|
| **0.8em** | 0.72em | WebScrapingTab.css |
| **0.9em** | 0.81em | WebScrapingTab.css |
| **1em** | 0.9em | WebScrapingTab.css |
| **1.1em** | 0.99em | WebScrapingTab.css |
| **1.2em** | 1.08em | WebScrapingTab.css |
| **1.4em** | 1.26em | WebScrapingTab.css |

### PX Units (Absolute)

| Current | Recommended | Used In Files |
|---------|-------------|---------------|
| **11px** | 10px | WorldwideEventScraper.css |
| **12px** | 11px | WorldwideEventScraper.css, WebScrapingTab.css |
| **13px** | 12px | WorldwideEventScraper.css, RoleManagement.css |
| **14px** | 13px | WorldwideEventScraper.css, RoleManagement.css, WebScrapingTab.css |
| **15px** | 14px | WorldwideEventScraper.css, RoleManagement.css, PermissionManager.css |
| **16px** | 15px | WorldwideEventScraper.css, RoleManagement.css, PermissionManager.css, LoginPage.css |
| **17px** | 16px | LoginPage.css |
| **18px** | 17px | WorldwideEventScraper.css, LoginPage.css |
| **20px** | 19px | RoleManagement.css, WorldwideEventScraper.css, LoginPage.css |
| **22px** | 21px | LoginPage.css |
| **24px** | 23px | WorldwideEventScraper.css, WebScrapingTab.css, PermissionManager.css, LoginPage.css |
| **28px** | 26px | WorldwideEventScraper.css, RoleManagement.css, PermissionManager.css, LoginPage.css |
| **32px** | 30px | PermissionManager.css, LoginPage.css |
| **38px** | 36px | LoginPage.css |
| **40px** | 38px | WorldwideEventScraper.css |
| **64px** | 61px | LoginPage.css |

### Variable References (CSS Custom Properties)

| Current | Files |
|---------|-------|
| `var(--font-h1)` | SummaryDashboard.css |
| `var(--font-h3)` | SummaryDashboard.css |
| `var(--font-body)` | SummaryDashboard.css |
| `var(--font-small)` | SummaryDashboard.css |

---

## Detailed File-by-File Breakdown

### ZohoCRMTab.css
**Font sizes used:**
- 0.8rem (4 instances)
- 0.85rem (2 instances)
- 0.9rem (7 instances)
- 0.95rem (3 instances)
- 1rem (4 instances)
- 1.1rem (4 instances)
- 1.2rem (2 instances)
- 1.3rem (1 instance)
- 1.4rem (1 instance)
- 1.5rem (2 instances)
- 1.8rem (1 instance)
- 2rem (2 instances)
- 2.5rem (1 instance)

**Recommended changes**: 34 total declarations to update

### WebScrapingTab.css
**Font sizes used:**
- 0.8em (1 instance)
- 0.9em (1 instance)
- 0.9rem (4 instances)
- 0.95rem (4 instances)
- 1em (4 instances)
- 1.1em (2 instances)
- 1.2em (1 instance)
- 1.3rem (1 instance)
- 1.4em (1 instance)
- 1.4rem (1 instance)
- 1.6rem (2 instances)
- 1.8rem (2 instances)
- 2.2rem (2 instances)
- 12px (1 instance)
- 14px (1 instance)
- 24px (1 instance)

**Recommended changes**: 29 total declarations to update

### WorldwideEventScraper.css
**Font sizes used:**
- 11px (1 instance)
- 12px (2 instances)
- 13px (2 instances)
- 14px (8 instances)
- 15px (3 instances)
- 16px (1 instance)
- 18px (5 instances)
- 20px (1 instance)
- 24px (1 instance)
- 28px (1 instance)
- 40px (1 instance)

**Recommended changes**: 26 total declarations to update

### RBACManager.css
**Font sizes used:**
- 0.7rem (1 instance)
- 0.8rem (3 instances)
- 0.85rem (3 instances)
- 0.9rem (3 instances)
- 0.95rem (2 instances)
- 1rem (2 instances)
- 1.1rem (3 instances)
- 1.2rem (2 instances)
- 1.3rem (2 instances)
- 1.4rem (1 instance)
- 1.5rem (2 instances)
- 2rem (2 instances)
- 3rem (1 instance)

**Recommended changes**: 28 total declarations to update

### SummaryDashboard.css
**Font sizes used:**
- 0.65rem (1 instance)
- 0.7rem (1 instance)
- 0.75rem (1 instance)
- 0.78rem (2 instances)
- 0.8rem (3 instances)
- 0.85rem (4 instances)
- 0.9rem (2 instances)
- 1rem (3 instances)
- 1.25rem (1 instance)
- 1.3rem (1 instance)
- 1.45rem (1 instance)
- CSS Variables (4 instances)

**Recommended changes**: 22 total declarations to update

### LoginPage.css
**Font sizes used:**
- 15px (1 instance)
- 16px (1 instance)
- 17px (1 instance)
- 18px (2 instances)
- 20px (1 instance)
- 22px (1 instance)
- 24px (1 instance)
- 32px (1 instance)
- 38px (1 instance)
- 64px (1 instance)

**Recommended changes**: 11 total declarations to update

### RoleManagement.css
**Font sizes used:**
- 12px (2 instances)
- 13px (3 instances)
- 14px (9 instances)
- 15px (2 instances)
- 16px (1 instance)
- 20px (2 instances)
- 28px (1 instance)

**Recommended changes**: 20 total declarations to update

### PermissionManager.css
**Font sizes used:**
- 13px (2 instances)
- 15px (1 instance)
- 16px (2 instances)
- 24px (1 instance)
- 28px (1 instance)
- 32px (1 instance)

**Recommended changes**: 8 total declarations to update

### PageHeader.css
**Font sizes used:**
- 0.95rem (1 instance)
- 1.5rem (1 instance)
- 1.875rem (1 instance)

**Recommended changes**: 3 total declarations to update

### SplashScreen.css
**Font sizes used:**
- 1.6rem (1 instance)
- 2.1rem (1 instance)
- 3.2rem (1 instance)

**Recommended changes**: 3 total declarations to update

---

## Reduction Pattern Applied

The recommended reduction pattern follows a consistent approach:
- **Smaller sizes (< 1rem)**: Reduce by ~10-15%
- **Medium sizes (1rem - 1.5rem)**: Reduce by ~10-15%
- **Larger sizes (> 1.5rem)**: Reduce by ~10-15%

### Conversion Table for Quick Reference

| Current Value | Type | Recommended | Reduction |
|---------------|------|-------------|-----------|
| 0.65rem | rem | 0.58rem | -10.8% |
| 0.7rem | rem | 0.63rem | -10% |
| 0.75rem | rem | 0.68rem | -9.3% |
| 0.78rem | rem | 0.70rem | -10.3% |
| 0.8rem | rem | 0.72rem | -10% |
| 0.85rem | rem | 0.77rem | -9.4% |
| 0.9rem | rem | 0.8rem | -11.1% |
| 0.95rem | rem | 0.85rem | -10.5% |
| 1rem | rem | 0.9rem | -10% |
| 1.1rem | rem | 0.95rem | -13.6% |
| 1.2rem | rem | 1.05rem | -12.5% |
| 1.25rem | rem | 1.1rem | -12% |
| 1.3rem | rem | 1.1rem | -15.4% |
| 1.4rem | rem | 1.2rem | -14.3% |
| 1.45rem | rem | 1.3rem | -10.3% |
| 1.5rem | rem | 1.3rem | -13.3% |
| 1.6rem | rem | 1.4rem | -12.5% |
| 1.8rem | rem | 1.6rem | -11.1% |
| 1.875rem | rem | 1.7rem | -9.3% |
| 2rem | rem | 1.8rem | -10% |
| 2.1rem | rem | 1.9rem | -9.5% |
| 2.2rem | rem | 2rem | -9.1% |
| 2.5rem | rem | 2.25rem | -10% |
| 3rem | rem | 2.7rem | -10% |
| 3.2rem | rem | 2.9rem | -9.4% |
| 11px | px | 10px | -9.1% |
| 12px | px | 11px | -8.3% |
| 13px | px | 12px | -7.7% |
| 14px | px | 13px | -7.1% |
| 15px | px | 14px | -6.7% |
| 16px | px | 15px | -6.3% |
| 17px | px | 16px | -5.9% |
| 18px | px | 17px | -5.6% |
| 20px | px | 19px | -5% |
| 22px | px | 21px | -4.5% |
| 24px | px | 23px | -4.2% |
| 28px | px | 26px | -7.1% |
| 32px | px | 30px | -6.3% |
| 38px | px | 36px | -5.3% |
| 40px | px | 38px | -5% |
| 64px | px | 61px | -4.7% |

---

## Notes

1. **CSS Variables**: SummaryDashboard.css uses CSS custom properties (`var(--font-h1)`, `var(--font-body)`, etc.). The actual values need to be found in the stylesheet where these variables are defined.

2. **Important Flags**: Some declarations include `!important` (LoginPage.css, WebScrapingTab.css) - these may require special attention during refactoring.

3. **Unit Consistency**: The codebase uses a mix of `rem`, `em`, and `px` units. Consider standardizing to one unit type (preferably `rem`) for better maintainability.

4. **Most Common Sizes**:
   - **rem units**: 0.9rem, 1rem, 1.2rem, 1.4rem, 1.5rem
   - **px units**: 14px, 16px, 18px, 28px
   - **em units**: 1em, 1.1em, 1.2em, 1.4em

---

## Files Requiring Updates

1. ✅ ZohoCRMTab.css (34 declarations)
2. ✅ WebScrapingTab.css (29 declarations)
3. ✅ WorldwideEventScraper.css (26 declarations)
4. ✅ RBACManager.css (28 declarations)
5. ✅ SummaryDashboard.css (22 declarations)
6. ✅ LoginPage.css (11 declarations)
7. ✅ RoleManagement.css (20 declarations)
8. ✅ PermissionManager.css (8 declarations)
9. ✅ PageHeader.css (3 declarations)
10. ✅ SplashScreen.css (3 declarations)

**Total font-size declarations to update: ~184 across 10 files**
