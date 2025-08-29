// functions/lib/db.ts
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from '../../shared/schema'; // Adjusted path to go up two directories
import { eq, inArray, or, and } from 'drizzle-orm';
import type { IStorage } from './storage';

// This creates a serverless-compatible database client
const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

export class DBStorage implements IStorage {
    // All of your database logic remains exactly the same as before.
    // The only thing that has changed is how the 'db' object is created.

    // User methods (placeholders)
    async getUser(id: string) { return undefined; }
    async getUserByUsername(username: string) { return undefined; }
    async createUser(user: schema.InsertUser) {
        const [newUser] = await db.insert(schema.users).values(user).returning();
        return newUser;
    }

    // Flow Account Methods
    async getFlowAccounts(): Promise<Record<string, string>> {
        const accounts = await db.query.flowAccounts.findMany();
        return accounts.reduce((acc, account) => {
            acc[account.name] = account.url;
            return acc;
        }, {} as Record<string, string>);
    }

    async createFlowAccount(account: { name: string, url: string }): Promise<void> {
        await db.insert(schema.flowAccounts).values(account);
    }

    async updateFlowAccount(name: string, newDetails: { newName?: string; url: string }): Promise<void> {
        const finalName = newDetails.newName || name;
        await db.update(schema.flowAccounts)
            .set({ name: finalName, url: newDetails.url })
            .where(eq(schema.flowAccounts.name, name));
    }

    async deleteFlowAccount(name: string): Promise<void> {
        await db.delete(schema.flowAccounts).where(eq(schema.flowAccounts.name, name));
    }

    // Email Templates
    async getEmailTemplates() {
        return db.query.emailTemplates.findMany();
    }
    async getEmailTemplate(id: string) {
        return db.query.emailTemplates.findFirst({ where: eq(schema.emailTemplates.id, id) });
    }
    async createEmailTemplate(template: schema.InsertEmailTemplate) {
        const [newTemplate] = await db.insert(schema.emailTemplates).values(template).returning();
        return newTemplate;
    }
    async updateEmailTemplate(id: string, template: Partial<schema.InsertEmailTemplate>) {
        const [updatedTemplate] = await db.update(schema.emailTemplates).set(template).where(eq(schema.emailTemplates.id, id)).returning();
        return updatedTemplate;
    }
    async deleteEmailTemplate(id: string) {
        const result = await db.delete(schema.emailTemplates).where(eq(schema.emailTemplates.id, id));
        return result.rowCount > 0;
    }

    // Email Campaigns
    async getEmailCampaigns() {
        return db.query.emailCampaigns.findMany();
    }
    async getEmailCampaign(id: string) {
        return db.query.emailCampaigns.findFirst({ where: eq(schema.emailCampaigns.id, id) });
    }
    async createEmailCampaign(campaign: schema.InsertEmailCampaign) {
        const [newCampaign] = await db.insert(schema.emailCampaigns).values(campaign).returning();
        return newCampaign;
    }
    async updateEmailCampaign(id: string, campaign: Partial<schema.EmailCampaign>) {
        const [updatedCampaign] = await db.update(schema.emailCampaigns).set(campaign).where(eq(schema.emailCampaigns.id, id)).returning();
        return updatedCampaign;
    }
    async deleteEmailCampaign(id: string) {
        await db.delete(schema.emailResults).where(eq(schema.emailResults.campaignId, id));
        const result = await db.delete(schema.emailCampaigns).where(eq(schema.emailCampaigns.id, id));
        return result.rowCount > 0;
    }

    async deleteCompletedCampaignsByAccount(flowAccount: string): Promise<void> {
        const finishedCampaigns = await db.query.emailCampaigns.findMany({
            where: and(
                eq(schema.emailCampaigns.flowAccount, flowAccount),
                or(
                    eq(schema.emailCampaigns.status, 'completed'),
                    eq(schema.emailCampaigns.status, 'stopped')
                )
            )
        });

        if (finishedCampaigns.length === 0) {
            return;
        }

        const campaignIds = finishedCampaigns.map(c => c.id);

        await db.delete(schema.emailResults).where(inArray(schema.emailResults.campaignId, campaignIds));
        await db.delete(schema.emailCampaigns).where(inArray(schema.emailCampaigns.id, campaignIds));
    }

    // Email Results
    async getEmailResults(campaignId: string) {
        return db.query.emailResults.findMany({ where: eq(schema.emailResults.campaignId, campaignId) });
    }
    async createEmailResult(result: schema.InsertEmailResult) {
        const [newResult] = await db.insert(schema.emailResults).values(result).returning();
        return newResult;
    }
    async clearEmailResults(campaignId: string) {
        const result = await db.delete(schema.emailResults).where(eq(schema.emailResults.campaignId, campaignId));
        return result.rowCount > 0;
    }
}