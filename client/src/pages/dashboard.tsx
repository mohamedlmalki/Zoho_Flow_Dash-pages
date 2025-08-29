// client/src/pages/dashboard.tsx
import { useState, useEffect, useMemo, memo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Send,
  Eye,
  Trash2,
  Upload,
  Download,
  CheckCircle,
  Users,
  BarChart3,
  RefreshCw,
  PlusCircle,
  Edit,
  Loader2,
  XCircle,
  Image as ImageIcon
} from "lucide-react";
import { CampaignStats } from "@/components/CampaignStats";
import { AnimatedCampaignStatus } from "@/components/AnimatedCampaignStatus";
import type {
  EmailCampaign,
  EmailTemplate,
  EmailResult,
} from "@shared/schema";

interface FormData {
  subject: string;
  htmlContent: string;
  delayBetweenEmails: number;
  batchSize: number;
  recipients: string;
  testEmail: string;
}

const initialFormData: FormData = {
    subject: "",
    htmlContent: "",
    delayBetweenEmails: 1,
    batchSize: 25,
    recipients: "",
    testEmail: "",
};


export default function Dashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formStates, setFormStates] = useState<Record<string, Partial<FormData>>>({});
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [connectionTestResult, setConnectionTestResult] = useState<{ status: string; data: any } | null>(null);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, 'unknown' | 'testing' | 'success' | 'failed'>>({});
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLink, setImageLink] = useState("");
  const [imageWidth, setImageWidth] = useState("");
  const [imageHeight, setImageHeight] = useState("");
  const [imageAlign, setImageAlign] = useState("center");
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);


  const currentFormData = useMemo(() => ({
      ...initialFormData,
      ...(formStates[selectedAccount] || {})
  }), [formStates, selectedAccount]);

  const handleFormChange = (field: keyof FormData, value: any) => {
      setFormStates(prev => ({
          ...prev,
          [selectedAccount]: {
              ...prev[selectedAccount],
              [field]: value,
          }
      }));
  };
  
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
  const [showInvalidEmails, setShowInvalidEmails] = useState(false);
  const [showDuplicateEmails, setShowDuplicateEmails] = useState(false);

  const [selectedResult, setSelectedResult] = useState<EmailResult | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isFailedEmailsModalOpen, setIsFailedEmailsModalOpen] = useState(false);

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<{ name: string; url: string } | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");


  // Fetch flow accounts
  const { data: flowAccounts = {} } = useQuery<Record<string, string>>({
    queryKey: ["/api/flow-accounts"],
  });
  
  // Fetch all campaigns for the selector
  const { data: allCampaigns = [] } = useQuery<EmailCampaign[]>({
    queryKey: ["/api/campaigns"],
    refetchInterval: 5000,
  });
  
  const { data: currentCampaign } = useQuery<EmailCampaign>({
      queryKey: ["/api/campaigns", currentCampaignId],
      enabled: !!currentCampaignId,
      refetchInterval: 2000, 
  });
  
  // Fetch campaign results
  const { data: campaignResults = [] } = useQuery<EmailResult[]>({
    queryKey: ["/api/campaigns", currentCampaignId, "results"],
    enabled: !!currentCampaignId,
    refetchInterval: 2000,
  });

  // Find the latest campaign for each account to display in the selector
  const latestCampaignByAccount = useMemo(() => {
    const campaignMap = new Map<string, EmailCampaign>();
    if (!allCampaigns || allCampaigns.length === 0) return campaignMap;
    
    const sortedCampaigns = [...allCampaigns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    for (const accountName in flowAccounts) {
        const latestCampaignForAccount = sortedCampaigns.find(c => c.flowAccount === accountName);
        if (latestCampaignForAccount) {
            campaignMap.set(accountName, latestCampaignForAccount);
        }
    }
    return campaignMap;
  }, [allCampaigns, flowAccounts]);


  // Auto-select first account when accounts are loaded
  useEffect(() => {
    if (Object.keys(flowAccounts).length > 0 && !selectedAccount) {
      const firstAccount = Object.keys(flowAccounts)[0];
      setSelectedAccount(firstAccount);
    }
  }, [flowAccounts, selectedAccount]);

  // When the selected flow account changes, find its most recent campaign and set it as current
  useEffect(() => {
    if (selectedAccount) {
        const latestCampaign = latestCampaignByAccount.get(selectedAccount);
        if (latestCampaign) {
            setCurrentCampaignId(latestCampaign.id);
        } else {
            setCurrentCampaignId(null);
        }
    }
  }, [selectedAccount, latestCampaignByAccount]);

  // Fetch templates
  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/templates"],
  });

  const accountMutationOptions = {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flow-accounts"] });
      setIsAccountModalOpen(false);
      setEditingAccount(null);
      setAccountName("");
      setAccountUrl("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  };

  const addAccountMutation = useMutation({
    mutationFn: (newAccount: { name: string; url: string }) =>
      apiRequest("POST", "/api/flow-accounts", newAccount),
    ...accountMutationOptions,
    onSuccess: (...args) => {
      accountMutationOptions.onSuccess(...args);
      toast({ title: "Success", description: "Account added successfully." });
    },
  });

  const editAccountMutation = useMutation({
    mutationFn: (updatedAccount: { oldName: string; newName: string; url: string }) =>
      apiRequest("PUT", `/api/flow-accounts/${updatedAccount.oldName}`, {
        newName: updatedAccount.newName,
        url: updatedAccount.url,
      }),
    ...accountMutationOptions,
    onSuccess: (...args) => {
      accountMutationOptions.onSuccess(...args);
      toast({ title: "Success", description: "Account updated successfully." });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (name: string) => apiRequest("DELETE", `/api/flow-accounts/${name}`),
    onSuccess: (_, deletedName) => {
        queryClient.invalidateQueries({ queryKey: ["/api/flow-accounts"] }).then(() => {
            if (selectedAccount === deletedName) {
                const remainingAccounts = Object.keys(flowAccounts).filter(name => name !== deletedName);
                if (remainingAccounts.length > 0) {
                    setSelectedAccount(remainingAccounts[0]);
                } else {
                    setSelectedAccount("");
                }
            }
        });
        toast({ title: "Success", description: "Account deleted successfully." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (name: string) => {
        setConnectionStatuses(prev => ({ ...prev, [name]: 'testing' }));
        const response = await apiRequest("POST", "/api/flow-accounts/test-connection", { name });
        return { name, data: await response.json() };
    },
    onSuccess: ({ name, data }) => {
        setConnectionTestResult(data);
        setIsConnectionModalOpen(true);
        setConnectionStatuses(prev => ({ ...prev, [name]: data.status }));
    },
    onError: (error: any, name: string) => {
        const responseData = error.response || error.message || "An unknown error occurred.";
        setConnectionTestResult({ status: 'failed', data: responseData });
        setIsConnectionModalOpen(true);
        setConnectionStatuses(prev => ({ ...prev, [name]: 'failed' }));
    }
  });


  const handleOpenAccountModal = (account: { name: string; url: string } | null = null) => {
    if (account) {
      setEditingAccount(account);
      setAccountName(account.name);
      setAccountUrl(account.url);
    } else {
      setEditingAccount(null);
      setAccountName("");
      setAccountUrl("");
    }
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = () => {
    if (editingAccount) {
      editAccountMutation.mutate({ oldName: editingAccount.name, newName: accountName, url: accountUrl });
    } else {
      addAccountMutation.mutate({ name: accountName, url: accountUrl });
    }
  };


  // Send test email mutation
  const sendTestEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/test-email", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Test Email Sent",
        description: `Test email sent successfully at ${data.timestamp}`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send test email.",
        variant: "destructive",
      });
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "Template Saved",
        description: "Email template has been saved successfully.",
      });
    },
  });

  // Clear results mutation
  const clearResultsMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/results`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/campaigns", currentCampaignId, "results"],
      });
      toast({
        title: "Results Cleared",
        description: "Campaign results have been cleared.",
      });
    },
  });

  const sendSingleEmailMutation = useMutation({
    mutationFn: (data: { campaignId: string, email: string }) =>
      apiRequest("POST", `/api/campaigns/${data.campaignId}/send-email`, { email: data.email }),
  });

  const processEmailsInBrowser = async (campaign: EmailCampaign) => {
    const remainingRecipients = campaign.recipients.slice(campaign.processedCount);

    if (campaign.status !== 'running' || remainingRecipients.length === 0) {
      return;
    }

    const emailToSend = remainingRecipients[0];

    try {
      await sendSingleEmailMutation.mutateAsync({ campaignId: campaign.id, email: emailToSend });
      // Invalidate queries after successful send to trigger the useEffect loop again
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaign.id, "results"] });

    } catch (error) {
      console.error(`Error sending email to ${emailToSend}. Pausing campaign.`, error);
      toast({
        title: "Sending Error",
        description: `Could not send email to ${emailToSend}. The campaign has been paused.`,
        variant: "destructive",
      });
      pauseCampaignMutation.mutate(campaign.id);
    }
  };
  
  // This useEffect now correctly drives the sending process
  useEffect(() => {
    if (currentCampaign && currentCampaign.status === 'running') {
      const delay = currentCampaign.delayBetweenEmails * 1000;
      const timer = setTimeout(() => {
        processEmailsInBrowser(currentCampaign);
      }, delay);
      
      // Cleanup timer if the component unmounts or the campaign changes
      return () => clearTimeout(timer);
    }
  }, [currentCampaign]);


  const createCampaignMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/campaigns", data),
    onSuccess: (newCampaign) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setCurrentCampaignId(newCampaign.id);
      toast({ title: "Campaign Created", description: "Starting campaign..." });
      startCampaignMutation.mutate(newCampaign.id);
    },
    onError: (error: any) => {
      const errorMessage = error.response?.error ? JSON.stringify(error.response.error) : (error.response?.message || error.message || "An unknown error occurred.");
      toast({ title: "Error Creating Campaign", description: errorMessage, variant: "destructive" });
    },
  });

  const startCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => apiRequest("POST", `/api/campaigns/${campaignId}/start`),
    onSuccess: (startedCampaign) => {
      queryClient.setQueryData(["/api/campaigns", startedCampaign.id], startedCampaign);
      toast({ title: "Campaign Started", description: "Email campaign is now running." });
      // The useEffect will now automatically pick this up and start sending
    },
    onError: (error: any) => {
      toast({ title: "Error Starting Campaign", description: error.message || "An unknown error occurred.", variant: "destructive" });
    },
  });

  const pauseCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => apiRequest("POST", `/api/campaigns/${campaignId}/pause`),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({ title: "Campaign Paused", description: "Email campaign has been paused." });
    },
  });

  const stopCampaignMutation = useMutation({
    mutationFn: (campaignId: string) => apiRequest("POST", `/api/campaigns/${campaignId}/stop`),
    onSuccess: (_, campaignId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({ title: "Campaign Stopped", description: "Email campaign has been stopped." });
    },
  });


    const handleCreateCampaign = () => {
    const { subject, recipients, htmlContent, delayBetweenEmails, batchSize } = currentFormData;

    if (!selectedAccount || !subject || !recipients.trim()) {
      toast({
        title: "Missing Information",
        description: "Please fill in an account, subject, and recipients.",
        variant: "destructive",
      });
      return;
    }

    const recipientList = recipients
      .split("\n")
      .map((email) => email.trim())
      .filter((email) => email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

    if (recipientList.length === 0) {
      toast({
        title: "No Valid Recipients",
        description: "Please add at least one valid email address.",
        variant: "destructive",
      });
      return;
    }

    const campaignPayload = {
      name: `Campaign - ${subject}`,
      subject,
      htmlContent,
      flowAccount: selectedAccount,
      recipients: recipientList,
      delayBetweenEmails,
      batchSize,
      status: 'draft',
    };

    createCampaignMutation.mutate(campaignPayload);
  };

  const handleSendTestEmail = () => {
    const currentForm = formStates[selectedAccount] || {};
    if (!currentForm.testEmail || !currentForm.subject || !selectedAccount) {
      toast({
        title: "Missing Information",
        description: "Please fill in test email, subject, and an account.",
        variant: "destructive",
      });
      return;
    }

    sendTestEmailMutation.mutate({
      email: currentForm.testEmail,
      subject: currentForm.subject,
      htmlContent: currentForm.htmlContent,
      flowAccount: selectedAccount,
    });
  };

  const handleSaveTemplate = () => {
    const currentForm = formStates[selectedAccount] || {};
    if (!currentForm.subject || !selectedAccount) {
      toast({
        title: "Missing Information",
        description: "Please fill in a subject and select an account.",
        variant: "destructive",
      });
      return;
    }

    const templateName = prompt("Enter template name:");
    if (!templateName) return;

    saveTemplateMutation.mutate({
      name: templateName,
      subject: currentForm.subject,
      htmlContent: currentForm.htmlContent,
      flowAccount: selectedAccount,
      delayBetweenEmails: currentForm.delayBetweenEmails,
      batchSize: currentForm.batchSize,
    });
  };

  const handleLoadTemplate = (template: EmailTemplate) => {
    setSelectedAccount(template.flowAccount);
    setFormStates(prev => ({
        ...prev,
        [template.flowAccount]: {
            ...prev[template.flowAccount],
            subject: template.subject,
            htmlContent: template.htmlContent,
            delayBetweenEmails: template.delayBetweenEmails,
            batchSize: template.batchSize,
        }
    }));
    
    toast({
      title: "Template Loaded",
      description: `Template "${template.name}" has been loaded for ${template.flowAccount}.`,
    });
  };

  const handleViewResponse = (result: EmailResult) => {
    setSelectedResult(result);
    setIsViewModalOpen(true);
  };

  const handleInsertImage = () => {
    if (!imageUrl) {
        toast({ title: "Image URL is required", variant: "destructive" });
        return;
    }

    let imgTag = `<img src="${imageUrl}" alt=""`;
    if (imageWidth) imgTag += ` width="${imageWidth}"`;
    if (imageHeight) imgTag += ` height="${imageHeight}"`;
    imgTag += ' style="border:0; display:block; outline:none; text-decoration:none; height:auto; width:100%; max-width:100%;" />';

    let linkedImage = imageLink ? `<a href="${imageLink}" target="_blank">${imgTag}</a>` : imgTag;
    
    let finalHtml = linkedImage;

    if (imageAlign !== 'left') { 
        finalHtml = `<div align="${imageAlign}">${linkedImage}</div>`
    }

    handleFormChange('htmlContent', (currentFormData.htmlContent || '') + '\n' + finalHtml);

    setIsImageModalOpen(false);
    setImageUrl('');
    setImageLink('');
    setImageWidth('');
    setImageHeight('');
    setImageAlign('center');
  };

  const recipientEmails = currentFormData.recipients
    .split("\n")
    .map((email) => email.trim())
    .filter((email) => email);

  const validEmails = recipientEmails.filter((email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  );
  const invalidEmails = recipientEmails.filter(
    (email) => email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  );
  const duplicateEmails = recipientEmails.filter(
    (email, index, arr) => email && arr.indexOf(email) !== index,
  );
  const uniqueDuplicates = Array.from(new Set(duplicateEmails));

  const isJobFinished = currentCampaign?.status === 'completed' || currentCampaign?.status === 'stopped';
  const showCreateButton = !currentCampaignId || isJobFinished;

  const renderConnectionStatus = () => {
    const status = connectionStatuses[selectedAccount] || 'unknown';

    if (status === 'testing') {
        return <Loader2 className="h-4 w-4 animate-spin" />;
    }

    if (status === 'failed') {
        return (
            <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full">
                <XCircle className="text-red-600" size={14} />
                <span className="text-red-600 text-xs font-medium">Failed</span>
            </div>
        );
    }

    return (
        <div className="flex items-center space-x-2 bg-[hsl(142,76%,94%)] px-3 py-1 rounded-full">
            <CheckCircle className="text-[hsl(142,76%,36%)]" size={14} />
            <span className="text-[hsl(142,76%,36%)] text-xs font-medium">Connected</span>
        </div>
    );
  };


  return (
    <div className="min-h-screen bg-[hsl(0,0%,98%)]">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-8 space-y-4">
            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="text-[hsl(217,91%,60%)]" size={18} />
                      <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                        Profile Selection
                      </CardTitle>
                    </div>
                    <div className="flex items-center space-x-2">
                       <Button variant="outline" size="sm" onClick={() => handleOpenAccountModal()}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Add
                        </Button>
                        <Button variant="outline" size="sm"
                          disabled={!selectedAccount}
                          onClick={() => handleOpenAccountModal({ name: selectedAccount, url: flowAccounts[selectedAccount] })}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                             <Button variant="outline" size="sm" disabled={!selectedAccount} className="border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the account "{selectedAccount}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteAccountMutation.mutate(selectedAccount)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                  </div>
                <p className="text-sm text-[hsl(215,16%,47%)] mt-1">
                  Choose the Zoho flow
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div>
                    <Label
                      htmlFor="flowAccount"
                      className="text-[hsl(220,26%,14%)] font-medium"
                    >
                      My Main Account
                    </Label>
                    <Select
                      value={selectedAccount}
                      onValueChange={(value) =>
                        setSelectedAccount(value)
                      }
                    >
                      <SelectTrigger className="mt-2 border-[hsl(214,32%,91%)] bg-white h-12">
                         <SelectValue placeholder="Select account...">
                           <div className="flex items-center justify-between w-full">
                                <span>{selectedAccount ? (selectedAccount.charAt(0).toUpperCase() + selectedAccount.slice(1).replace(/([A-Z])/g, " $1")) : 'Select account...'}</span>
                                {latestCampaignByAccount.has(selectedAccount) && (
                                    <AnimatedCampaignStatus campaign={latestCampaignByAccount.get(selectedAccount)!} />
                                )}
                            </div>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(flowAccounts).map(([key, url]) => (
                          <SelectItem key={key} value={key}>
                            <div className="flex justify-between w-full">
                                <span>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")}</span>
                                {latestCampaignByAccount.has(key) && (
                                    <AnimatedCampaignStatus campaign={latestCampaignByAccount.get(key)!} />
                                )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="bg-[hsl(0,0%,98%)] p-4 rounded-lg border border-[hsl(214,32%,91%)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[hsl(220,26%,14%)]">
                          Active Profile
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[hsl(215,16%,47%)]"
                            onClick={() => selectedAccount && testConnectionMutation.mutate(selectedAccount)}
                            disabled={testConnectionMutation.isPending}
                        >
                            {renderConnectionStatus()}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[hsl(215,16%,47%)]"
                        >
                          <RefreshCw size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="text-[hsl(217,91%,60%)]" size={18} />
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                    Create a flow
                  </CardTitle>
                </div>
                <p className="text-sm text-[hsl(215,16%,47%)] mt-1">
                  Create multiple flows simultaneously for different
                  recipients
                </p>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div>
                  <Label className="text-[hsl(220,26%,14%)] font-medium">
                    Subject
                  </Label>
                  <Input
                    value={currentFormData.subject}
                    onChange={(e) =>
                      handleFormChange('subject', e.target.value)
                    }
                    placeholder="Enter ticket subject..."
                    className="mt-2 border-[hsl(214,32%,91%)] bg-white"
                  />
                </div>
                <div>
                  <Label className="text-[hsl(220,26%,14%)] font-medium">
                    Delay Between Tickets
                  </Label>
                  <div className="flex items-center space-x-2 mt-2">
                    <Input
                      type="number"
                      min="1"
                      value={currentFormData.delayBetweenEmails}
                      onChange={(e) =>
                        handleFormChange('delayBetweenEmails', parseInt(e.target.value) || 1)
                      }
                      className="w-20 border-[hsl(214,32%,91%)] bg-white"
                    />
                    <span className="text-sm text-[hsl(215,16%,47%)]">
                      seconds
                    </span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-[hsl(220,26%,14%)] font-medium">
                      Description
                    </Label>
                    <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-[hsl(215,16%,47%)]"
                            onClick={() => setIsImageModalOpen(true)}
                        >
                            <ImageIcon size={14} className="mr-1" />
                            Add Image
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-[hsl(215,16%,47%)]"
                            onClick={() => setIsPreviewModalOpen(true)}
                        >
                            <Eye size={14} className="mr-1" />
                            Preview
                        </Button>
                    </div>
                  </div>
                  <Textarea
                    value={currentFormData.htmlContent}
                    onChange={(e) =>
                      handleFormChange('htmlContent', e.target.value)
                    }
                    placeholder="Enter ticket description (HTML supported)..."
                    className="min-h-[150px] border-[hsl(214,32%,91%)] bg-white"
                  />
                  <p className="text-xs text-[hsl(215,16%,47%)] mt-2">
                    HTML formatting is supported
                  </p>
                </div>
                <div className="pt-4">
                  {showCreateButton && (
                    <Button
                      onClick={handleCreateCampaign}
                      disabled={createCampaignMutation.isPending}
                      className="w-full bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white py-3 text-base font-medium"
                    >
                      <BarChart3 size={16} className="mr-2" />
                      {isJobFinished ? 'Create New Campaign' : `Make ${validEmails.length} flow`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-4 flex flex-col">
            <Card className="border-[hsl(214,32%,91%)] shadow-sm flex flex-col flex-grow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                    Recipient Emails
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-[hsl(214,32%,91%)]"
                    >
                      <Upload size={14} className="mr-1" />
                      Import
                    </Button>
                    <span className="text-sm font-semibold text-[hsl(217,91%,60%)]">
                      {validEmails.length} emails
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex flex-col flex-grow">
                <div className="space-y-3 flex flex-col flex-grow">
                  <Textarea
                    value={currentFormData.recipients}
                    onChange={(e) =>
                      handleFormChange('recipients', e.target.value)
                    }
                    placeholder="user1@example.com&#10;user2@example.com&#10;user3@example.com"
                    className="border-[hsl(214,32%,91%)] bg-white font-mono text-sm flex-grow"
                  />
                  <p className="text-xs text-[hsl(215,16%,47%)] mt-1">
                    Enter one email address per line, or import from a .csv/.txt
                    file.
                  </p>
                  {recipientEmails.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[hsl(215,16%,47%)]">
                          Validation:
                        </span>
                        <div className="flex items-center space-x-3">
                          <div className="flex items-center space-x-1">
                            <div className="w-3 h-3 bg-[hsl(142,76%,36%)] rounded-full"></div>
                            <span className="text-[hsl(142,76%,36%)] font-medium">
                              {validEmails.length} valid
                            </span>
                          </div>
                          {invalidEmails.length > 0 && (
                            <button
                              onClick={() =>
                                setShowInvalidEmails(!showInvalidEmails)
                              }
                              className="flex items-center space-x-1 hover:bg-[hsl(0,84%,94%)] px-2 py-1 rounded"
                            >
                              <div className="w-3 h-3 bg-[hsl(0,84%,60%)] rounded-full"></div>
                              <span className="text-[hsl(0,84%,60%)] font-medium">
                                {invalidEmails.length} invalid
                              </span>
                            </button>
                          )}
                          {uniqueDuplicates.length > 0 && (
                            <button
                              onClick={() =>
                                setShowDuplicateEmails(!showDuplicateEmails)
                              }
                              className="flex items-center space-x-1 hover:bg-[hsl(38,92%,94%)] px-2 py-1 rounded"
                            >
                              <div className="w-3 h-3 bg-[hsl(38,92%,50%)] rounded-full"></div>
                              <span className="text-[hsl(38,92%,50%)] font-medium">
                                {uniqueDuplicates.length} duplicated
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                      {showInvalidEmails && invalidEmails.length > 0 && (
                        <div className="bg-[hsl(0,84%,94%)] border border-[hsl(0,84%,80%)] rounded-lg p-3">
                          <p className="text-sm font-medium text-[hsl(0,84%,60%)] mb-2">
                            Invalid Email Addresses:
                          </p>
                          <div className="space-y-1 text-sm font-mono">
                            {invalidEmails.map((email, index) => (
                              <div
                                key={index}
                                className="text-[hsl(0,84%,50%)]"
                              >
                                {email}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {showDuplicateEmails && uniqueDuplicates.length > 0 && (
                        <div className="bg-[hsl(38,92%,94%)] border border-[hsl(38,92%,80%)] rounded-lg p-3">
                          <p className="text-sm font-medium text-[hsl(38,92%,50%)] mb-2">
                            Duplicated Email Addresses:
                          </p>
                          <div className="space-y-1 text-sm font-mono">
                            {uniqueDuplicates.map((email, index) => (
                              <div
                                key={index}
                                className="text-[hsl(38,92%,40%)]"
                              >
                                {email}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                  Send Test Email
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <Input
                  value={currentFormData.testEmail}
                  onChange={(e) =>
                    handleFormChange('testEmail', e.target.value)
                  }
                  placeholder="mohamedmaikj@yahoo.com"
                  className="border-[hsl(214,32%,91%)] bg-white"
                />
                <Button
                  onClick={handleSendTestEmail}
                  disabled={sendTestEmailMutation.isPending}
                  className="w-full bg-[hsl(142,76%,36%)] hover:bg-[hsl(142,76%,26%)] text-white"
                >
                  <Send size={16} className="mr-2" />
                  Send Test Email
                </Button>
                <div className="flex items-center space-x-2 text-sm text-[hsl(142,76%,36%)]">
                  <CheckCircle size={16} />
                  <span>Test email sent successfully! (11:09:40 PM)</span>
                </div>
              </CardContent>
            </Card>

            {templates.length > 0 && (
              <Card className="border-[hsl(214,32%,91%)] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                    Saved Templates
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {templates.slice(0, 5).map((template) => (
                      <div
                        key={template.id}
                        className="flex items-center justify-between p-2 border border-[hsl(214,32%,91%)] rounded"
                      >
                        <span className="text-sm text-[hsl(220,26%,14%)]">
                          {template.name}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleLoadTemplate(template)}
                          className="text-[hsl(217,91%,60%)] text-xs"
                        >
                          Load
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <div className="space-y-6 mt-6">
          {currentCampaignId && (
            <CampaignStats 
              currentCampaignId={currentCampaignId}
              onPause={pauseCampaignMutation.mutate}
              onStop={stopCampaignMutation.mutate}
              onResume={startCampaignMutation.mutate}
              pauseMutation={pauseCampaignMutation}
              stopMutation={stopCampaignMutation}
              startMutation={startCampaignMutation}
              onShowFailed={() => setIsFailedEmailsModalOpen(true)}
            />
          )}

          {campaignResults.length > 0 && (
            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
                    Sending Results
                  </CardTitle>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-[hsl(214,32%,91%)]"
                    >
                      <Download size={14} className="mr-1" />
                      Export
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        currentCampaignId &&
                        clearResultsMutation.mutate(currentCampaignId)
                      }
                      className="text-xs border-[hsl(0,84%,60%)] text-[hsl(0,84%,60%)]"
                    >
                      <Trash2 size={14} className="mr-1" />
                      Clear
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {campaignResults.slice().reverse().map((result, index) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between py-2 border-b border-[hsl(214,32%,91%)] last:border-b-0"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-sm font-medium text-[hsl(220,26%,14%)] w-8">
                          {campaignResults.length - index}
                        </span>
                        <span className="text-sm text-[hsl(220,26%,14%)]">
                          {result.email}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="w-20 flex justify-center">
                          {result.status === "success" ? (
                            <Badge className="bg-[hsl(142,76%,36%)] text-white text-xs">
                              Success
                            </Badge>
                          ) : (
                            <Badge className="bg-[hsl(0,84%,60%)] text-white text-xs">
                              Failed
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-[hsl(215,16%,47%)] w-24 text-right">
                          {new Date(result.timestamp).toLocaleTimeString()}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-[hsl(217,91%,60%)]"
                          onClick={() => handleViewResponse(result)}
                        >
                          <Eye size={16} />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Response for {selectedResult?.email}</DialogTitle>
            <DialogDescription>
              This is the raw response received from the Zoho Flow server.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-96 overflow-auto bg-gray-100 p-4 rounded-md">
            <pre className="text-sm">
              <code>{selectedResult?.response}</code>
            </pre>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isFailedEmailsModalOpen} onOpenChange={setIsFailedEmailsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Failed Emails</DialogTitle>
            <DialogDescription>
              A list of all email addresses that failed to send.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-96 overflow-auto bg-gray-100 p-4 rounded-md">
            <ul className="space-y-1">
              {campaignResults
                .filter((result) => result.status === 'failed')
                .map((result) => (
                  <li key={result.id} className="text-sm font-mono text-red-600">{result.email}</li>
                ))}
            </ul>
          </div>
        </DialogContent>
      </Dialog>
       <Dialog open={isAccountModalOpen} onOpenChange={setIsAccountModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Account" : "Add New Account"}</DialogTitle>
            <DialogDescription>
              {editingAccount ? "Update the details for this Zoho Flow account." : "Enter the details for the new Zoho Flow account."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name</Label>
              <Input id="name" value={accountName} onChange={(e) => setAccountName(e.target.value)} className="col-span-3" />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="url" className="text-right">Webhook URL</Label>
              <Input id="url" value={accountUrl} onChange={(e) => setAccountUrl(e.target.value)} className="col-span-3" />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveAccount} disabled={addAccountMutation.isPending || editAccountMutation.isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isConnectionModalOpen} onOpenChange={setIsConnectionModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connection Test Result</DialogTitle>
             <DialogDescription>
              {connectionTestResult?.status === 'success' ? 'Successfully connected to Zoho Flow.' : 'Failed to connect to Zoho Flow.'}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 max-h-96 overflow-auto bg-gray-100 p-4 rounded-md">
            <pre className="text-sm">
                <code>{JSON.stringify(connectionTestResult?.data, null, 2)}</code>
            </pre>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={isImageModalOpen} onOpenChange={setIsImageModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
                <DialogTitle>Add Image</DialogTitle>
                <DialogDescription>
                    Insert an image into your email content.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="imageUrl" className="text-right">Image URL</Label>
                    <Input id="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="col-span-3" />
                </div>
                {imageUrl && (
                    <div className="col-span-4 flex justify-center p-4 bg-gray-100 rounded-md">
                        <img src={imageUrl} alt="Preview" className="max-w-full max-h-48" />
                    </div>
                )}
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="imageLink" className="text-right">Link URL</Label>
                    <Input id="imageLink" value={imageLink} onChange={(e) => setImageLink(e.target.value)} className="col-span-3" placeholder="Optional: https://..." />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label className="text-right">Size</Label>
                    <div className="col-span-3 grid grid-cols-2 gap-2">
                        <Input value={imageWidth} onChange={(e) => setImageWidth(e.target.value)} placeholder="Width (e.g., 150)" />
                        <Input value={imageHeight} onChange={(e) => setImageHeight(e.target.value)} placeholder="Height (e.g., 100)" />
                    </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="imageAlign" className="text-right">Alignment</Label>
                    <Select value={imageAlign} onValueChange={setImageAlign}>
                        <SelectTrigger className="col-span-3">
                            <SelectValue placeholder="Select alignment" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="left">Left</SelectItem>
                            <SelectItem value="center">Center</SelectItem>
                            <SelectItem value="right">Right</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleInsertImage}>Insert Image</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
        <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                    <DialogTitle>Email Preview</DialogTitle>
                </DialogHeader>
                <div
                    className="prose"
                    dangerouslySetInnerHTML={{ __html: currentFormData.htmlContent }}
                />
            </DialogContent>
        </Dialog>
    </div>
  );
}