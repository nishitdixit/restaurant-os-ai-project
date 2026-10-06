# Identity & Tenant Boundary

This module owns server-side tenant context and permission decisions. Authentication credentials/session verification are deliberately represented as an adapter boundary; no custom password cryptography is introduced.

Rules:

- tenant ID comes from verified membership/store mapping, never from an untrusted body field;
- inactive memberships fail closed;
- permissions are centralized;
- tenant-owned repositories must require `TenantContext`;
- background jobs must carry tenant identity explicitly.
