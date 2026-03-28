---
name: Convenience Store
type: organization
version: 1.0.0
category: business
author: ClawMax Team
tags:
  - business
  - retail
  - small-business
  - inventory
  - operations
---

A small business multiagent team for running a convenience store. Manages daily inventory counts, restock alerts, shift scheduling, and floor operations.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| store-manager | Store Manager | Overall store operations — manages P&L, approves restock orders, handles staffing decisions, and resolves escalated customer issues | lead, management, retail |  |
| inventory-clerk | Inventory Clerk | Inventory management — conducts daily counts, tracks stock levels, generates restock orders, and manages supplier communications | inventory, retail |  |
| cashier-lead | Cashier Lead | Floor operations — manages cash registers, handles customer complaints, trains new cashiers, and maintains store presentation | retail, floor, customer-service |  |

## Communities

- **Store Team** — All store team coordination and announcements

## Groups

- **Inventory** — Stock levels, restock orders, and supplier communications (Store Team)
- **Floor Operations** — Customer service, cash handling, and store presentation (Store Team)
- **Status** — Daily briefings and store performance (Store Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: store-manager; tags: lead

# Store Team Kickoff

You are the Store Manager. Your team just came online.

## Store Configuration
> **Customize these before applying:**

- **Store name:** [e.g., Quick Stop Market]
- **Location:** [e.g., 123 Main St, Downtown]
- **Operating hours:** [e.g., 6am-11pm daily]
- **Key categories:** [e.g., snacks, beverages, tobacco, lottery]
- **Suppliers:** [e.g., Sysco, local distributors]

## Your Tasks
1. Introduce yourself in the Store Team community
2. Review the workspace for existing inventory data or schedules
3. Assign responsibilities to inventory clerk and cashier lead
4. Set up the daily inventory count schedule
5. Post opening priorities to Status group

### Daily Inventory Count
- **Schedule:** 0 6 * * *
- **Mode:** automated
- **Targets:** agents: inventory-clerk; groups: Inventory

# Daily Inventory Count

1. Walk the store and count stock levels for all tracked categories
2. Compare counts against minimum stock thresholds
3. Flag any items below restock threshold or approaching expiry
4. Generate restock order draft for manager approval
5. Post inventory summary to Status group

### Restock Alerts
- **Schedule:** 0 */4 * * *
- **Mode:** automated
- **Targets:** groups: Inventory

# Restock Alert Check

1. Check fast-moving items against minimum stock levels
2. Flag any critical shortages (items at zero or near-zero)
3. For critical items: notify store manager immediately
4. Check pending restock orders and expected delivery dates
5. Update inventory tracking with any received deliveries

### Shift Scheduling
- **Schedule:** 0 18 * * 0
- **Mode:** managed
- **Targets:** agents: store-manager; groups: Floor Operations

# Weekly Shift Schedule

1. Review next week's expected traffic (weekdays vs weekends, any events)
2. Draft shift schedule ensuring coverage for all operating hours
3. Assign cashier lead to peak hours
4. Post draft schedule to Floor Operations group for team review
5. Finalize and post confirmed schedule to Status group
