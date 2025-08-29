// mohamedlmalki/zoho_flow_dash-pages/Zoho_Flow_Dash-pages-7af3500f1040941193f8e4fcb88162e46351b972/server/storage.ts
import { DBStorage } from './db';
import type {
  User,
  InsertUser,
  EmailTemplate,
  InsertEmailTemplate,
  EmailCampaign,
  InsertEmailCampaign,
  EmailResult,
  InsertEmailResult
} from "@shared/schema";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  getFlowAccounts(): Promise<Record<string, string>>;
  createFlowAccount(account: { name: string, url: string }): Promise<void>;
  updateFlowAccount(name: string, newDetails: { newName?: string; url: string }): Promise<void>;
  deleteFlowAccount(name: string): Promise<void>;

  getEmailTemplates(): Promise<EmailTemplate[]>;
  getEmailTemplate(id: string): Promise<EmailTemplate | undefined>;
  createEmailTemplate(template: InsertEmailTemplate): Promise<EmailTemplate>;
  updateEmailTemplate(id: string, template: Partial<InsertEmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<boolean>;

  getEmailCampaigns(): Promise<EmailCampaign[]>;
  getEmailCampaign(id: string): Promise<EmailCampaign | undefined>;
  createEmailCampaign(campaign: InsertEmailCampaign): Promise<EmailCampaign>;
  updateEmailCampaign(id: string, campaign: Partial<EmailCampaign>): Promise<EmailCampaign | undefined>;
  deleteEmailCampaign(id: string): Promise<boolean>;

  getEmailResults(campaignId: string): Promise<EmailResult[]>;
  createEmailResult(result: InsertEmailResult): Promise<EmailResult>;
  clearEmailResults(campaignId: string): Promise<boolean>;
}

export const storage = new DBStorage();