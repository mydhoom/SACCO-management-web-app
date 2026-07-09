# Sacco Management System API

## Overview

The **Sacco Management System API** is an enterprise-grade REST API built with **Express.js** and **MongoDB**. This API provides comprehensive features for managing small and medium-sized SACCOs, including member management, savings, loans, audit logs, notifications, and advanced reporting.

---

## Features

- **Authentication and Authorization**
  - JWT-based authentication.
  - Role-based access control (Admin, Member).
  
- **Member Management**
  - Add, view, update, and delete members.
  
- **Savings Management**
  - Add savings, view member savings, and generate savings reports.

- **Loan Management**
  - Apply for loans, approve/reject requests, and manage loan repayments.

- **Audit Logs**
  - Track user actions for accountability.

- **Advanced Reporting**
  - Generate reports with date-range filters.
  - Export data to CSV/Excel.

- **Notifications**
  - Email and SMS notifications for important actions.

- **Security Features**
  - Input validation.
  - Rate limiting to prevent abuse.
  - Centralized error handling.

---

## Tech Stack

- **Backend Framework:** Node.js with Express.js
- **Database:** MongoDB
- **Authentication:** JSON Web Tokens (JWT)
- **Environment Variables Management:** dotenv
- **Documentation:** Swagger (OpenAPI)

---

## Installation

### Prerequisites
- **Node.js** (v16 or higher)
- **MongoDB** (v5 or higher)
- **npm** or **yarn**

### Steps
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/sacco-management-api.git
   cd sacco-management-api
