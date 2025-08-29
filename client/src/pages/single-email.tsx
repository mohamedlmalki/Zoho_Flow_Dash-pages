// mohamedlmalki/zoho_flow_dash-pages/Zoho_Flow_Dash-pages-7af3500f1040941193f8e4fcb88162e46351b972/client/src/pages/single-email.tsx
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  Mail, 
  Send, 
  CheckCircle, 
  RefreshCw,
  Users,
  PlusCircle,
  Edit,
  Trash2,
  Loader2,
  XCircle,
  Image as ImageIcon,
  Eye
} from "lucide-react";
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
import type { EmailTemplate } from "@shared/schema";

interface FormData {
  flowAccount: string;
  subject: string;
  htmlContent: string;
  recipientEmail: string;
}

export default function SingleEmail() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState<FormData>({
    flowAccount: "",
    subject: "",
    htmlContent: "",
    recipientEmail: ""
  });

  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<{ name: string; url: string } | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountUrl, setAccountUrl] = useState("");
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


  // Fetch flow accounts
  const { data: flowAccounts = {} } = useQuery<Record<string, string>>({
    queryKey: ['/api/flow-accounts'],
  });
  
  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async (name: string) => {
        setConnectionStatuses(prev => ({ ...prev, [name]: 'testing' }));
        const response = await apiRequest("POST", "/api/flow-accounts/test-connection", { name });
        return { name, data: await response.json() };
    },
    onSuccess: ({ name, data }) => {
        setConnectionStatuses(prev => ({ ...prev, [name]: data.status }));
    },
    onError: (error: any, name: string) => {
        setConnectionStatuses(prev => ({ ...prev, [name]: 'failed' }));
    }
  });

  // Auto-test connection on account selection
  useEffect(() => {
    if (formData.flowAccount && connectionStatuses[formData.flowAccount] === 'unknown') {
      testConnectionMutation.mutate(formData.flowAccount);
    }
  }, [formData.flowAccount, connectionStatuses]);

  // Initialize connection statuses when accounts are loaded
  useEffect(() => {
    if (Object.keys(flowAccounts).length > 0) {
      const initialStatuses = Object.keys(flowAccounts).reduce((acc, name) => {
        acc[name] = 'unknown';
        return acc;
      }, {} as Record<string, 'unknown' | 'testing' | 'success' | 'failed'>);
      setConnectionStatuses(initialStatuses);
    }
  }, [flowAccounts]);

  // Auto-select first account when accounts are loaded
  useEffect(() => {
    if (Object.keys(flowAccounts).length > 0 && !formData.flowAccount) {
      const firstAccount = Object.keys(flowAccounts)[0];
      setFormData(prev => ({ ...prev, flowAccount: firstAccount }));
    }
  }, [flowAccounts, formData.flowAccount]);

  // Fetch templates
  const { data: templates = [] } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/templates'],
  });

  const accountMutationOptions = {
    onSuccess: (data: any, variables: any) => {
      const name = variables.newName || variables.name || accountName;
      queryClient.invalidateQueries({ queryKey: ["/api/flow-accounts"] });
      setIsAccountModalOpen(false);
      setEditingAccount(null);
      setAccountName("");
      setAccountUrl("");
      testConnectionMutation.mutate(name); // Auto-test after add/edit
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
            if (formData.flowAccount === deletedName) {
                const remainingAccounts = Object.keys(flowAccounts).filter(name => name !== deletedName);
                if (remainingAccounts.length > 0) {
                    setFormData(prev => ({ ...prev, flowAccount: remainingAccounts[0] }));
                } else {
                    setFormData(prev => ({ ...prev, flowAccount: "" }));
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

  // Send single email mutation
  const sendEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/test-email', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Email Sent",
        description: `Email sent successfully at ${data.timestamp}`,
      });
      // Clear the form after successful send
      setFormData({
        ...formData,
        recipientEmail: "",
        subject: "",
        htmlContent: ""
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send email.",
        variant: "destructive",
      });
    },
  });

  // Save template mutation
  const saveTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', '/api/templates', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({
        title: "Template Saved",
        description: "Email template has been saved successfully.",
      });
    },
  });

  const handleSendEmail = () => {
    if (!formData.recipientEmail || !formData.subject || !formData.flowAccount) {
      toast({
        title: "Missing Information",
        description: "Please fill in recipient email, subject, and flow account.",
        variant: "destructive",
      });
      return;
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.recipientEmail)) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    sendEmailMutation.mutate({
      email: formData.recipientEmail,
      subject: formData.subject,
      htmlContent: formData.htmlContent,
      flowAccount: formData.flowAccount
    });
  };

  const handleSaveTemplate = () => {
    if (!formData.subject || !formData.flowAccount) {
      toast({
        title: "Missing Information",
        description: "Please fill in subject and flow account.",
        variant: "destructive",
      });
      return;
    }

    const templateName = prompt("Enter template name:");
    if (!templateName) return;

    saveTemplateMutation.mutate({
      name: templateName,
      subject: formData.subject,
      htmlContent: formData.htmlContent,
      flowAccount: formData.flowAccount,
      delayBetweenEmails: 1,
      batchSize: 1
    });
  };

  const handleLoadTemplate = (template: EmailTemplate) => {
    setFormData({
      ...formData,
      subject: template.subject,
      htmlContent: template.htmlContent,
      flowAccount: template.flowAccount
    });
    toast({
      title: "Template Loaded",
      description: `Template "${template.name}" has been loaded.`,
    });
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

    setFormData(prev => ({
        ...prev,
        htmlContent: prev.htmlContent + '\n' + finalHtml
    }));

    setIsImageModalOpen(false);
    setImageUrl('');
    setImageLink('');
    setImageWidth('');
    setImageHeight('');
    setImageAlign('center');
  };

  const renderConnectionStatus = () => {
    const status = connectionStatuses[formData.flowAccount] || 'unknown';

    if (status === 'testing' || status === 'unknown') {
        return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    }
    if (status === 'success') {
        return (
            <div className="flex items-center space-x-2 bg-green-100 px-3 py-1 rounded-full">
                <CheckCircle className="text-green-700" size={14} />
                <span className="text-green-700 text-xs font-medium">Connected</span>
            </div>
        );
    }
    if (status === 'failed') {
        return (
            <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full">
                <XCircle className="text-red-700" size={14} />
                <span className="text-red-700 text-xs font-medium">Failed</span>
            </div>
        );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-[hsl(0,0%,98%)]">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Content */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Profile Selection Card */}
            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
               <CardHeader className="pb-3">
                 <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Users className="text-[hsl(217,91%,60%)]" size={18} />
                      <CardTitle className="text-lg text-[hsl(220,26%,14%)]">Profile Selection</CardTitle>
                    </div>
                    <div className="flex items-center space-x-2">
                       <Button variant="outline" size="sm" onClick={() => handleOpenAccountModal()}>
                          <PlusCircle className="mr-2 h-4 w-4" /> Add
                        </Button>
                        <Button variant="outline" size="sm"
                          disabled={!formData.flowAccount}
                          onClick={() => handleOpenAccountModal({ name: formData.flowAccount, url: flowAccounts[formData.flowAccount] })}>
                          <Edit className="mr-2 h-4 w-4" /> Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                             <Button variant="outline" size="sm" disabled={!formData.flowAccount} className="border-red-500 text-red-500 hover:bg-red-50 hover:text-red-600">
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete the account "{formData.flowAccount}".
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteAccountMutation.mutate(formData.flowAccount)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                    </div>
                  </div>
                <p className="text-sm text-[hsl(215,16%,47%)] mt-1">Choose the Zoho Flow profile for email delivery</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="flowAccount" className="text-[hsl(220,26%,14%)] font-medium">My Main Account</Label>
                    <Select value={formData.flowAccount} onValueChange={(value) => setFormData({...formData, flowAccount: value})}>
                      <SelectTrigger className="mt-2 border-[hsl(214,32%,91%)] bg-white">
                        <SelectValue placeholder="Select account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(flowAccounts).map(([key, url]) => (
                          <SelectItem key={key} value={key}>
                            {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="bg-[hsl(0,0%,98%)] p-4 rounded-lg border border-[hsl(214,32%,91%)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-[hsl(220,26%,14%)]">Active Profile</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-[hsl(215,16%,47%)]"
                            onClick={() => formData.flowAccount && testConnectionMutation.mutate(formData.flowAccount)}
                            disabled={testConnectionMutation.isPending || !formData.flowAccount}
                        >
                            {renderConnectionStatus()}
                        </Button>
                        <Button variant="ghost" size="sm" className="text-[hsl(215,16%,47%)]">
                          <RefreshCw size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Send Single Email Card */}
            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center space-x-2">
                  <Mail className="text-[hsl(217,91%,60%)]" size={18} />
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">Send Single Email</CardTitle>
                </div>
                <p className="text-sm text-[hsl(215,16%,47%)] mt-1">Send an individual email to a single recipient</p>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {/* Recipient Email */}
                <div>
                  <Label className="text-[hsl(220,26%,14%)] font-medium">Recipient Email</Label>
                  <Input
                    value={formData.recipientEmail}
                    onChange={(e) => setFormData({...formData, recipientEmail: e.target.value})}
                    placeholder="user@example.com"
                    className="mt-2 border-[hsl(214,32%,91%)] bg-white"
                    type="email"
                  />
                </div>

                {/* Email Subject */}
                <div>
                  <Label className="text-[hsl(220,26%,14%)] font-medium">Email Subject</Label>
                  <Input
                    value={formData.subject}
                    onChange={(e) => setFormData({...formData, subject: e.target.value})}
                    placeholder="Enter email subject..."
                    className="mt-2 border-[hsl(214,32%,91%)] bg-white"
                  />
                </div>

                {/* Email Content */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <Label className="text-[hsl(220,26%,14%)] font-medium">Email Content</Label>
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
                    value={formData.htmlContent}
                    onChange={(e) => setFormData({...formData, htmlContent: e.target.value})}
                    placeholder="Enter email content (HTML supported)..."
                    className="min-h-[200px] border-[hsl(214,32%,91%)] bg-white"
                  />
                  <p className="text-xs text-[hsl(215,16%,47%)] mt-2">HTML formatting is supported</p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center space-x-3 pt-4">
                  <Button 
                    onClick={handleSendEmail}
                    disabled={sendEmailMutation.isPending}
                    className="flex-1 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white py-3 text-base font-medium"
                  >
                    <Send size={16} className="mr-2" />
                    {sendEmailMutation.isPending ? 'Sending...' : 'Send Email'}
                  </Button>
                  <Button 
                    onClick={handleSaveTemplate}
                    disabled={saveTemplateMutation.isPending}
                    variant="outline"
                    className="border-[hsl(214,32%,91%)]"
                  >
                    Save Template
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            {/* Email Status */}
            <Card className="border-[hsl(214,32%,91%)] shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-[hsl(220,26%,14%)]">Email Status</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[hsl(215,16%,47%)]">Mode:</span>
                    <Badge className="bg-[hsl(217,91%,94%)] text-[hsl(217,91%,60%)]">Single Email</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-[hsl(215,16%,47%)]">Status:</span>
                    <Badge className="bg-[hsl(142,76%,94%)] text-[hsl(142,76%,36%)]">Ready</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Templates */}
            {templates.length > 0 && (
              <Card className="border-[hsl(214,32%,91%)] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-[hsl(220,26%,14%)]">Saved Templates</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {templates.slice(0, 5).map((template) => (
                      <div key={template.id} className="flex items-center justify-between p-2 border border-[hsl(214,32%,91%)] rounded">
                        <span className="text-sm text-[hsl(220,26%,14%)]">{template.name}</span>
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
      </div>
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
            dangerouslySetInnerHTML={{ __html: formData.htmlContent }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}