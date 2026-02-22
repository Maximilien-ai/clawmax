# ClawMax CLI - Feature Specification

**Status**: Planned
**Estimated Effort**: 4-5 hours
**Priority**: Nice-to-Have

---

## Overview

ClawMax CLI is a new workspace management layer that sits above openclaw, providing high-level orchestration for complex agent organizations.

### Architecture Separation

- **`openclaw`**: Low-level agent operations (existing)
  - Individual agent lifecycle management
  - Agent process control
  - Direct agent interactions

- **`clawmax`**: Workspace management layer (new)
  - Community & group templates
  - Workspace-level health monitoring
  - Bulk operations and orchestration
  - Template sharing and distribution

---

## Template System

### Directory Structure

```
TEMPLATES/
├── engineering-team/
│   ├── template.json
│   ├── COMMUNITIES.md
│   ├── GROUPS.md
│   └── README.md
├── customer-support/
│   ├── template.json
│   ├── COMMUNITIES.md
│   └── GROUPS.md
└── default/
    └── template.json
```

### Template Structure (template.json)

```json
{
  "name": "engineering-team",
  "version": "1.0.0",
  "description": "Standard engineering team structure",
  "author": "ClawMax Team",
  "communities": [
    {
      "name": "Engineering",
      "description": "All engineering agents",
      "defaultMembers": ["engineer", "qa-engineer", "release-engineer"]
    }
  ],
  "groups": [
    {
      "name": "Backend Team",
      "description": "Backend development group",
      "defaultMembers": ["engineer", "senior-engineer"],
      "channels": {
        "whatsapp": true
      }
    }
  ],
  "roles": [
    {
      "name": "engineer",
      "soul": "Golang backend developer",
      "tools": ["github", "docker", "postgres"]
    }
  ]
}
```

---

## CLI Commands

### Template Management

```bash
# Save current workspace structure as template
clawmax template create <name>

# Apply template to current workspace
clawmax template apply <name>

# List available templates
clawmax template list

# Export template to share
clawmax template export <name> --output ./my-template.tar.gz

# Import shared template
clawmax template import ./my-template.tar.gz

# Show template details
clawmax template show <name>

# Delete template
clawmax template delete <name>
```

### Workspace Management

```bash
# Initialize new workspace from template
clawmax workspace init --template engineering-team

# Show workspace health and statistics
clawmax workspace status

# Validate workspace configuration
clawmax workspace validate

# Backup workspace
clawmax workspace backup --output ./backup.tar.gz

# Restore workspace
clawmax workspace restore ./backup.tar.gz
```

---

## Dashboard UI Integration

### Templates Tab

**Location**: New tab in dashboard navigation

**Features**:
- Browse available templates
- Preview template structure (communities, groups, roles)
- One-click template application
- Template customization before applying
- Template creation from current workspace
- Import/export templates

**UI Components**:
```
TemplatesPage
├── TemplateList
│   └── TemplateCard
├── TemplatePreview
│   ├── CommunityPreview
│   ├── GroupPreview
│   └── RolePreview
├── TemplateApplyModal
│   └── CustomizationForm
└── TemplateCreateModal
    └── TemplateForm
```

---

## Implementation Plan

### Phase 1: Core CLI (2 hours)
- Create clawmax CLI tool structure
- Implement template create command
- Implement template list command
- Basic template.json schema validation

### Phase 2: Template Operations (1 hour)
- Implement template apply command
- Implement template export/import
- Add template validation
- Test with sample templates

### Phase 3: Dashboard Integration (1.5 hours)
- Create Templates tab in dashboard
- Implement template browsing UI
- Add preview functionality
- One-click apply feature

### Phase 4: Testing & Documentation (30 min)
- Create sample templates (engineering, support, sales)
- Write CLI documentation
- Add user guide for templates
- Integration tests

---

## Benefits

### For Small Teams (10-20 agents)
- Quick setup with best-practice patterns
- Consistent team structures
- Easy onboarding of new agent types

### For Large Organizations (100-200+ agents)
- Rapid scaling with proven templates
- Standardized organizational patterns
- Cross-team consistency
- Template sharing between departments

### For Community
- Share successful agent organizations
- Build template marketplace
- Document best practices
- Accelerate adoption

---

## Future Enhancements

### Template Marketplace
- Public template repository
- Community-contributed templates
- Template ratings and reviews
- One-click install from marketplace

### Advanced Features
- Template versioning and upgrades
- Conditional template application
- Template inheritance
- Environment-specific templates (dev/staging/prod)

### Integration
- GitHub Actions for template deployment
- CI/CD pipeline templates
- Infrastructure-as-Code templates
- Terraform/Pulumi integration

---

## Success Metrics

- [ ] CLI tool successfully creates templates
- [ ] Templates can be applied without errors
- [ ] Dashboard shows available templates
- [ ] Template import/export works
- [ ] Sample templates demonstrate value
- [ ] Documentation is clear and complete

---

## Dependencies

- Existing workspace structure
- COMMUNITIES.md and GROUPS.md format
- Agent IDENTITY.md format
- Dashboard infrastructure

---

## Open Questions

1. Should templates support agent cloning, or just structure?
2. How to handle conflicts when applying templates?
3. Should templates support version migrations?
4. What's the best distribution format (tar.gz, zip, git)?
