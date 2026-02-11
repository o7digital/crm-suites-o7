# ANNEX 2 - SECURITY MEASURES (TEMPLATE)

Date: {{security_annex_date}}

## 1. Security governance
- documented security policy
- periodic access reviews
- administrator action logging

## 2. Access control
- MFA recommended
- role-based access (OWNER / ADMIN / MEMBER)
- least privilege principle

## 3. Encryption
- in transit: TLS 1.2+
- at rest: provider storage encryption where available
- secrets managed outside source code

## 4. Availability and continuity
- backup frequency: {{backup_frequency}}
- restore test frequency: {{restore_test_frequency}}
- monitoring and alerting in place

## 5. Application security
- input validation
- server-side authorization controls
- vulnerability remediation process

## 6. Logging and traceability
- access and error logs
- timestamped critical operations
- log retention: {{log_retention_period}}

## 7. Incident management
- detection, classification, remediation
- customer notification for relevant incidents
- post-incident corrective actions

## 8. Human resources
- confidentiality commitments
- periodic security awareness

## 9. Sub-processors
- baseline security due diligence
- contractual security obligations

## 10. Continuous improvement
- annual review of controls
- updates aligned with risk and state of the art

Reference targets:
- RPO: {{rpo_target}}
- RTO: {{rto_target}}
- maintenance window: {{maintenance_window}}
