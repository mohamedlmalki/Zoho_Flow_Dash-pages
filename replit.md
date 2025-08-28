# Replit.md

## Overview

This is an email campaign management application that integrates with Zoho Flow webhooks. The system allows users to create, manage, and execute email campaigns through a React frontend with an Express backend. It features email template management, campaign execution with batch processing, progress tracking, and integration with multiple Zoho Flow accounts for email delivery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Library**: Shadcn/ui components built on Radix UI primitives
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack Query (React Query) for server state management
- **Routing**: Wouter for client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM configured for PostgreSQL
- **Session Management**: In-memory storage with fallback to database storage
- **API Design**: RESTful endpoints with JSON responses
- **Error Handling**: Centralized error middleware with structured error responses

### Database Schema
- **Users**: Basic user authentication with username/password
- **Email Templates**: Reusable email templates with HTML content and flow account configuration
- **Email Campaigns**: Campaign management with recipient lists, batch processing settings, and status tracking
- **Email Results**: Individual email delivery results with status and response tracking

### Email Campaign Processing
- **Batch Processing**: Configurable batch sizes for email sending
- **Rate Limiting**: Configurable delays between email batches
- **Status Tracking**: Real-time campaign status updates (draft, running, paused, completed, stopped)
- **Progress Monitoring**: Detailed tracking of processed, successful, and failed email counts

### Development Workflow
- **Hot Reload**: Vite development server with HMR
- **Type Safety**: Full TypeScript coverage across frontend and backend
- **Code Splitting**: Vite handles automatic code splitting and optimization
- **Build Process**: Separate builds for client (Vite) and server (esbuild)

## External Dependencies

### Third-Party Services
- **Zoho Flow**: Primary email delivery service via webhook integrations
- **Neon Database**: PostgreSQL database hosting (via @neondatabase/serverless)

### Key Libraries
- **Database**: Drizzle ORM with PostgreSQL adapter
- **UI Components**: Radix UI primitives with Shadcn/ui component library
- **HTTP Client**: Axios for external API calls
- **Validation**: Zod for schema validation
- **Authentication**: Session-based authentication with connect-pg-simple
- **Date Handling**: date-fns for date manipulation
- **Icons**: Lucide React for consistent iconography

### Development Tools
- **Build Tools**: Vite for frontend, esbuild for backend
- **Database Migrations**: Drizzle Kit for schema management
- **Type Checking**: TypeScript compiler
- **CSS Processing**: PostCSS with Tailwind CSS and Autoprefixer
- **Development Environment**: Replit-specific plugins for error overlay and cartographer integration