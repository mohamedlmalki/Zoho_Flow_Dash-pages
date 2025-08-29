// mohamedlmalki/zoho_flow_dash-pages/Zoho_Flow_Dash-pages-7af3500f1040941193f8e4fcb88162e46351b972/client/src/components/CampaignStats.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Pause, Square } from "lucide-react";
import type { EmailCampaign, EmailResult } from "@shared/schema";

interface CampaignStatsProps {
  currentCampaignId: string | null;
  onPause: (id: string) => void;
  onStop: (id: string) => void;
  onResume: (id: string) => void;
  pauseMutation: { isPending: boolean };
  stopMutation: { isPending: boolean };
  startMutation: { isPending: boolean };
  onShowFailed: () => void;
}

export const CampaignStats: React.FC<CampaignStatsProps> = ({
  currentCampaignId,
  onPause,
  onStop,
  onResume,
  pauseMutation,
  stopMutation,
  startMutation,
  onShowFailed,
}) => {
  const { data: currentCampaign } = useQuery<EmailCampaign>({
      queryKey: ["/api/campaigns", currentCampaignId],
      enabled: !!currentCampaignId,
      refetchInterval: (query) => {
        const campaign = query.state.data;
        return campaign?.status === "running"
          ? Math.max(campaign.delayBetweenEmails * 1000, 500)
          : false;
      },
  });

  const { data: campaignResults = [] } = useQuery<EmailResult[]>({
    queryKey: ["/api/campaigns", currentCampaignId, "results"],
    enabled: !!currentCampaignId,
    refetchInterval: (query) => {
        const campaign = currentCampaign;
        return campaign?.status === "running"
          ? Math.max(campaign.delayBetweenEmails * 1000, 500)
          : false;
      },
  });

  const [animatedProcessed, setAnimatedProcessed] = useState(0);
  const animationFrameRef = useRef<number>();

  // ** THE FIX IS HERE **
  // We now base the processed count on the length of the results array
  const actualProcessedCount = campaignResults.length;

  useEffect(() => {
    if (currentCampaign) {
      const targetProcessed = actualProcessedCount;
      const startProcessed = animatedProcessed;

      if (targetProcessed === startProcessed) {
        return;
      }
      
      if (currentCampaign.status !== 'running') {
        setAnimatedProcessed(targetProcessed);
        return;
      }
      
      const duration = 400; 
      let startTime: number | null = null;
      
      const animate = (currentTime: number) => {
        if (startTime === null) startTime = currentTime;
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        const nextValue = Math.floor(startProcessed + (targetProcessed - startProcessed) * progress);

        setAnimatedProcessed(nextValue);

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);

      return () => {
        if(animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    }
  }, [actualProcessedCount, currentCampaign?.status]);

  useEffect(() => {
    if (currentCampaign) {
      setAnimatedProcessed(actualProcessedCount);
    } else {
      setAnimatedProcessed(0);
    }
  }, [currentCampaign?.id, actualProcessedCount]);


  if (!currentCampaign) {
    return null;
  }

  const totalRecipients = currentCampaign.recipients.length || 0;
  const successCount = campaignResults.filter(r => r.status === 'success').length;
  const failedCount = campaignResults.filter(r => r.status === 'failed').length;
  const pending = Math.max(0, totalRecipients - animatedProcessed);
  const progressPercentage = totalRecipients > 0 ? Math.round((animatedProcessed / totalRecipients) * 100) : 0;

  return (
    <Card className="border-[hsl(214,32%,91%)] shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-[hsl(220,26%,14%)]">
            Sending Progress
          </CardTitle>
          <Badge
            variant={currentCampaign.status === "running" ? "default" : "secondary"}
            className={
              currentCampaign.status === "running"
                ? "bg-[hsl(142,76%,36%)] text-white"
                : "bg-[hsl(214,32%,91%)] text-[hsl(215,16%,47%)]"
            }
          >
            {currentCampaign.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-[hsl(215,16%,47%)]">
              Processing {animatedProcessed} / {totalRecipients}...
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-[hsl(142,76%,36%)]">
              {successCount}
            </div>
            <div className="text-xs text-[hsl(215,16%,47%)]">
              Success
            </div>
          </div>
          <div>
            <button onClick={() => failedCount > 0 && onShowFailed()} className="text-2xl font-bold text-[hsl(0,84%,60%)] disabled:opacity-50" disabled={failedCount === 0}>
                {failedCount}
            </button>
            <div className="text-xs text-[hsl(215,16%,47%)]">
              Failed
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-[hsl(38,92%,50%)]">
              {pending}
            </div>
            <div className="text-xs text-[hsl(215,16%,47%)]">
              Pending
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 pt-2">
          {currentCampaign.status === "running" ? (
            <>
              <Button
                onClick={() => onPause(currentCampaign.id)}
                disabled={pauseMutation.isPending}
                variant="outline"
                size="sm"
                className="flex-1 border-[hsl(38,92%,50%)] text-[hsl(38,92%,50%)]"
              >
                <Pause size={14} className="mr-2" />
                Pause
              </Button>
              <Button
                onClick={() => onStop(currentCampaign.id)}
                disabled={stopMutation.isPending}
                variant="outline"
                size="sm"
                className="flex-1 border-[hsl(0,84%,60%)] text-[hsl(0,84%,60%)]"
              >
                <Square size={14} className="mr-2" />
                End Job
              </Button>
            </>
          ) : currentCampaign.status === "paused" ? (
            <>
              <Button
                onClick={() => onResume(currentCampaign.id)}
                disabled={startMutation.isPending}
                className="flex-1 bg-[hsl(217,91%,60%)] hover:bg-[hsl(217,91%,50%)] text-white"
                size="sm"
              >
                <Play size={14} className="mr-2" />
                Resume Campaign
              </Button>
              <Button
                onClick={() => onStop(currentCampaign.id)}
                disabled={stopMutation.isPending}
                variant="outline"
                size="sm"
                className="flex-1 border-[hsl(0,84%,60%)] text-[hsl(0,84%,60%)]"
              >
                <Square size={14} className="mr-2" />
                End Job
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};