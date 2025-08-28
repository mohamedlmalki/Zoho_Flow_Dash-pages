import { 
  type User, 
  type InsertUser,
  type EmailTemplate,
  type InsertEmailTemplate,
  type EmailCampaign,
  type InsertEmailCampaign,
  type EmailResult,
  type InsertEmailResult
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Email Templates
  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<boolean>;
  
  // Email Campaigns
  getEmailCampaigns(): Promise<EmailCampaign[]>;
  getEmailCampaign(id: string): Promise<EmailCampaign | undefined>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, campaign: Partial<EmailCampaign>): Promise<EmailCampaign | undefined>;
  deleteEmailCampaign(id: string): Promise<boolean>;
  
  // Email Results
  getEmailResults(campaignId: string): Promise<EmailResult[]>;
  createEmailResult(result: InsertEmailResult): Promise<EmailResult>;
  clearEmailResults(campaignId: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private emailTemplates: Map<string, EmailTemplate>;
  private emailCampaigns: Map<string, EmailCampaign>;
  private emailResults: Map<string, EmailResult>;

  constructor() {
    this.users = new Map();
    this.emailTemplates = new Map();
    this.emailCampaigns = new Map();
    this.emailResults = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Email Templates
  async getEmailTemplates(): Promise<EmailTemplate[]> {
    return Array.from(this.emailTemplates.values());
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    return this.emailTemplates.get(id);
  }

  async createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate> {
    const id = randomUUID();
    const emailTemplate: EmailTemplate = { 
      ...template, 
      id,
      delayBetweenEmails: template.delayBetweenEmails ?? 1,
      batchSize: template.batchSize ?? 25
    };
    this.emailTemplates.set(id, emailTemplate);
    return emailTemplate;
  }

  async updateEmailTemplate(id: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined> {
    const existing = this.emailTemplates.get(id);
    if (!existing) return undefined;
    
    const updated: EmailTemplate = { ...existing, ...template };
    this.emailTemplates.set(id, updated);
    return updated;
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    return this.emailTemplates.delete(id);
  }

  // Email Campaigns
  async getEmailCampaigns(): Promise<EmailCampaign[]> {
    return Array.from(this.emailCampaigns.values());
  }

  async getEmailCampaign(id: string): Promise<EmailCampaign | undefined> {
    return this.emailCampaigns.get(id);
  }

  async createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign> {
    const id = randomUUID();
    const emailCampaign: EmailCampaign = { 
      ...campaign, 
      id,
      status: campaign.status ?? 'draft',
      delayBetweenEmails: campaign.delayBetweenEmails ?? 1,
      batchSize: campaign.batchSize ?? 25,
      processedCount: 0,
      successCount: 0,
      failedCount: 0,
      createdAt: new Date()
    };
    this.emailCampaigns.set(id, emailCampaign);
    return emailCampaign;
  }

  async updateEmailCampaign(id: string, campaign: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
    const existing = this.emailCampaigns.get(id);
    if (!existing) return undefined;
    
    const updated: EmailCampaign = { ...existing, ...campaign };
    this.emailCampaigns.set(id, updated);
    return updated;
  }

  async deleteEmailCampaign(id: string): Promise<boolean> {
    return this.emailCampaigns.delete(id);
  }

  // Email Results
  async getEmailResults(campaignId: string): Promise<EmailResult[]> {
    return Array.from(this.emailResults.values()).filter(result => result.campaignId === campaignId);
  }

  async createEmailResult(result: InsertEmailResult): Promise<EmailResult> {
    const id = randomUUID();
    const emailResult: EmailResult = { 
      ...result, 
      id,
      response: result.response ?? null,
      timestamp: new Date()
    };
    this.emailResults.set(id, emailResult);
    return emailResult;
  }

  async clearEmailResults(campaignId: string): Promise<boolean> {
    const results = Array.from(this.emailResults.entries()).filter(([_, result]) => result.campaignId === campaignId);
    results.forEach(([id, _]) => this.emailResults.delete(id));
    return true;
  }
}

export const storage = new MemStorage();
