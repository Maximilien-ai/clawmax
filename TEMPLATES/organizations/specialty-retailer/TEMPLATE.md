---
name: Specialty Retailer
type: organization
version: 1.0.0
category: business
author: ClawMax Team
tags:
  - business
  - retail
  - small-business
  - e-commerce
---

A small business multiagent team for running a specialty retail store. Manages product curation, pricing strategy, merchandising, and customer relationships.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| owner | Store Owner | Business owner — sets strategy, approves purchases, manages P&L, and handles key customer relationships | lead, management, retail | github, gh-issues |
| buyer | Buyer | Product sourcing — evaluates new products, negotiates with suppliers, manages purchase orders, and tracks trends | retail, buying, sourcing | github, gh-issues |
| merchandiser | Merchandiser | Visual merchandising — plans store layout, manages displays, tracks product performance, and optimizes placement | retail, merchandising, display | github, gh-issues |
| customer-service | Customer Service | Customer care — handles inquiries, processes returns, manages loyalty program, and collects feedback | retail, customer-service, support | github, gh-issues |

## Communities

- **Store Team** — All store team coordination and announcements

## Groups

- **Buying** — Product sourcing, supplier management, and purchase orders (Store Team)
- **Merchandising** — Store layout, displays, and product placement (Store Team)
- **Customer Care** — Customer inquiries, returns, and feedback (Store Team)
- **Status** — Daily briefings and store performance (Store Team)

## Workflows

### Team Kickoff
- **Schedule:** manual
- **Mode:** managed
- **Targets:** agents: owner; tags: lead

# Specialty Retailer Kickoff

You are the Store Owner. Your team just came online.

## Project Configuration
> **Customize these before applying:**

- **Store type:** [e.g., boutique clothing, artisan coffee, craft supplies]
- **Product categories:** [e.g., women's apparel, accessories, home goods]
- **Key suppliers:** [e.g., local artisans, wholesale distributors]
- **Target customers:** [e.g., young professionals, gift shoppers]
- **GitHub repo:** [e.g., owner/repo — for catalog and inventory tracking]

## Your Tasks
1. Introduce yourself in the Store Team community
2. Review the workspace for existing product data or supplier contacts
3. Brief the buyer on sourcing priorities and budget
4. Set merchandising goals with the merchandiser
5. Establish customer service standards and response times

### Product Curation
- **Schedule:** 0 9 * * 1
- **Mode:** managed
- **Targets:** groups: Buying

# Weekly Product Curation

1. Buyer: review new product submissions and supplier catalogs
2. Evaluate each product against brand fit, margin targets, and customer demand
3. Owner: approve or reject proposed additions to the catalog
4. Update product database with new items and discontinuations
5. Post catalog changes summary to Status group

### Pricing Review
- **Schedule:** 0 8 * * *
- **Mode:** automated
- **Targets:** groups: Merchandising

# Daily Pricing Review

1. Check competitor pricing for key products
2. Calculate current margins against target thresholds
3. Flag items below minimum margin or significantly above market
4. Recommend price adjustments with justification
5. Post pricing summary to Status group

### Customer Follow-up
- **Schedule:** 0 */4 * * *
- **Mode:** automated
- **Targets:** agents: customer-service; groups: Customer Care

# Customer Follow-up Cycle

1. Check for pending customer inquiries and respond within SLA
2. Process any return or exchange requests
3. Review recent customer feedback for product or service issues
4. Update FAQ if common questions are emerging
5. Flag any escalations to the owner
