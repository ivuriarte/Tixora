# Product Package Data Privacy Record - July 2026

**Effective date:** July 4, 2026

**Scope:** Referral codes, attendee demographics, sponsor presentation, and custom event sections

## Purpose

This record defines how the July 2026 product-package data should be collected, accessed, reported, retained, and removed. It supplements the platform privacy policy and does not authorize unrelated use of attendee information.

## Data Inventory

| Data | Source | Purpose | Access boundary | Public exposure |
|---|---|---|---|---|
| Birthday | Account onboarding and registration | Age validation and future aggregate age reporting | Attendee and authorized event-management workflows | Never |
| Gender | Account onboarding and registration | Future aggregate demographic reporting | Attendee and authorized event-management workflows | Never |
| City | Profile and registration | Geographic analysis and event planning | Attendee and authorized event-management workflows | Never |
| Referral code snapshot | Registration pricing | Reproduce the commercial terms used at checkout | Registration owner and authorized event managers | Code may appear on the owner's receipt; configuration is not public |
| Referral usage | Successful registration | Usage-limit enforcement and campaign reporting | Authorized event managers | Never |
| Sponsor presentation data | Event organizer | Public sponsor recognition | Authorized event managers can edit | Name, tier, description, website, and visible logo may be public |
| Custom event sections | Event organizer | Flexible public event information | Authorized event managers can edit | Visible sections are public |

## Collection Rules

- Collect only fields required by the active form and business purpose.
- Birthday must be a valid past date within the last 120 years.
- Gender values use the controlled application list; free-text values must not be accepted unless a reviewed self-description workflow is introduced.
- City must not be blank and should not be treated as verified residence.
- Do not infer sensitive traits from birthday, gender, city, referral behavior, or event attendance.

## Access and Export Rules

- Event-management endpoints must enforce event and organization ownership.
- Public event responses must not contain birthday, gender, city, or referral usage records.
- Attendee-level exports are operational records and must only be available to authorized event managers.
- Executive or external demographic reports must use aggregates. Groups smaller than the approved privacy threshold must be combined into "Other" or suppressed.
- Sponsor contact records and relationship notes remain outside the product scope.

## Retention and Deletion

- Retain referral snapshots with the registration for financial and audit reproducibility.
- Retain referral usage records for the same period as the related registration unless legal or contractual requirements specify otherwise.
- Apply the platform's account deletion and data-subject request process to birthday, gender, and city where deletion is legally permitted.
- Before production launch, the Product Owner and Privacy Owner must record the formal retention period for attendee demographics.
- Backups age out according to the approved backup-retention policy; deletion requests may remain in immutable backups until normal expiry.

## Security Controls

- Data validation and pricing calculations occur on the API.
- Referral redemptions are serialized to prevent concurrent overuse.
- Sponsor uploads accept JPG, PNG, and WebP only, with size limits.
- Organizer-controlled external images are not proxied through the platform image optimizer.
- Audit events cover referral creation and activation changes.

## UAT Privacy Acceptance

- Use synthetic names and demographic values only.
- Confirm UAT and production databases remain isolated.
- Confirm unauthorized users cannot retrieve referral dashboards, usage CSVs, or attendee demographics.
- Confirm public event and registration-validation responses contain no attendee-level demographic information.
- Confirm aggregate demographic reports suppress small cohorts before production promotion.

## Ownership and Review

| Role | Responsibility |
|---|---|
| Product Owner | Approves the stated purpose and required fields |
| Privacy Owner | Approves retention and aggregate-report thresholds |
| Engineering Owner | Maintains authorization, validation, encryption, and audit controls |
| Event Organizer | Uses exports only for the event's legitimate operational purpose |

Review this record before production promotion and whenever demographic reporting, sponsor data, or referral attribution changes.
