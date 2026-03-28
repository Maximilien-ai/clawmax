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
agents:
  - id: owner
    name: Store Owner
    role: >-
      Business owner — sets strategy, approves purchases, manages P&L, and
      handles key customer relationships
    tags:
      - lead
      - management
      - retail
    skills:
      - github
      - gh-issues
    communities:
      - Store Team
    groups:
      - Buying
      - Merchandising
      - Status
  - id: buyer
    name: Buyer
    role: >-
      Product sourcing — evaluates new products, negotiates with suppliers,
      manages purchase orders, and tracks trends
    tags:
      - retail
      - buying
      - sourcing
    skills:
      - github
      - gh-issues
    communities:
      - Store Team
    groups:
      - Buying
      - Status
  - id: merchandiser
    name: Merchandiser
    role: >-
      Visual merchandising — plans store layout, manages displays, tracks
      product performance, and optimizes placement
    tags:
      - retail
      - merchandising
      - display
    skills:
      - github
      - gh-issues
    communities:
      - Store Team
    groups:
      - Merchandising
      - Status
  - id: customer-service
    name: Customer Service
    role: >-
      Customer care — handles inquiries, processes returns, manages loyalty
      program, and collects feedback
    tags:
      - retail
      - customer-service
      - support
    skills:
      - github
      - gh-issues
    communities:
      - Store Team
    groups:
      - Customer Care
      - Status
communities:
  - name: Store Team
    description: All store team coordination and announcements
groups:
  - name: Buying
    description: 'Product sourcing, supplier management, and purchase orders'
    community: Store Team
  - name: Merchandising
    description: 'Store layout, displays, and product placement'
    community: Store Team
  - name: Customer Care
    description: 'Customer inquiries, returns, and feedback'
    community: Store Team
  - name: Status
    description: Daily briefings and store performance
    community: Store Team
workflows:
  - id: kickoff
    name: Team Kickoff
    description: Initialize the store team and set business priorities
    schedule: manual
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups: []
      tags:
        - lead
      agents:
        - owner
    content: >-
      # Specialty Retailer Kickoff


      You are the Store Owner. Your team just came online.


      ## Project Configuration

      > **Customize these before applying:**


      - **Store type:** [e.g., boutique clothing, artisan coffee, craft
      supplies]

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
  - id: product-curation
    name: Product Curation
    description: Weekly product review and catalog updates
    schedule: 0 9 * * 1
    enabled: true
    executionMode: managed
    targeting:
      communities: []
      groups:
        - Buying
      tags: []
      agents: []
    content: >-
      # Weekly Product Curation


      1. Buyer: review new product submissions and supplier catalogs

      2. Evaluate each product against brand fit, margin targets, and customer
      demand

      3. Owner: approve or reject proposed additions to the catalog

      4. Update product database with new items and discontinuations

      5. Post catalog changes summary to Status group
  - id: pricing-review
    name: Pricing Review
    description: Daily competitive pricing check and margin analysis
    schedule: 0 8 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Merchandising
      tags: []
      agents: []
    content: |-
      # Daily Pricing Review

      1. Check competitor pricing for key products
      2. Calculate current margins against target thresholds
      3. Flag items below minimum margin or significantly above market
      4. Recommend price adjustments with justification
      5. Post pricing summary to Status group
  - id: customer-follow-up
    name: Customer Follow-up
    description: Regular customer inquiry and feedback processing
    schedule: 0 */4 * * *
    enabled: true
    executionMode: automated
    targeting:
      communities: []
      groups:
        - Customer Care
      tags: []
      agents:
        - customer-service
    content: |-
      # Customer Follow-up Cycle

      1. Check for pending customer inquiries and respond within SLA
      2. Process any return or exchange requests
      3. Review recent customer feedback for product or service issues
      4. Update FAQ if common questions are emerging
      5. Flag any escalations to the owner
---
A small business multiagent team for running a specialty retail store. Manages product curation, pricing strategy, merchandising, and customer relationships.
