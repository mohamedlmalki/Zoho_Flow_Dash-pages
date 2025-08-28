import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Dashboard from "@/pages/dashboard";
import SingleEmail from "@/pages/single-email";
import NotFound from "@/pages/not-found";
import Navbar from "@/components/navbar";

function Router() {
  return (
    <div>
      <Navbar />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/single" component={SingleEmail} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
