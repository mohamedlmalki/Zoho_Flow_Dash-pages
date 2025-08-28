import React, { useState, useEffect, useRef, memo } from 'react';
import type { EmailCampaign } from "@shared/schema";

// Helper component for campaign status indicator
const CampaignStatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case 'running':
            return <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />;
        case 'paused':
            return <div className="w-2 h-2 rounded-full bg-yellow-500" />;
        case 'completed':
            return <div className="w-2 h-2 rounded-full bg-blue-500" />;
        case 'stopped':
            return <div className="w-2 h-2 rounded-full bg-red-500" />;
        default:
            return <div className="w-2 h-2 rounded-full bg-gray-400" />;
    }
};

// This is a memoized component, meaning it will only re-render if its `campaign` prop changes.
export const AnimatedCampaignStatus = memo(({ campaign }: { campaign: EmailCampaign }) => {
    const [animatedProcessed, setAnimatedProcessed] = useState(campaign.processedCount);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        const targetProcessed = campaign.processedCount;
        const startProcessed = animatedProcessed;

        if (targetProcessed === startProcessed) return;

        if (campaign.status !== 'running') {
            setAnimatedProcessed(targetProcessed);
            return;
        }

        const duration = 400; // Animate over a quick 400ms for a smooth feel
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
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [campaign.processedCount, campaign.status]);
    
    // Reset animation when the campaign ID changes
    useEffect(() => {
        setAnimatedProcessed(campaign.processedCount);
    }, [campaign.id]);


    return (
        <div className="flex items-center gap-2">
             <CampaignStatusBadge status={campaign.status} />
            <span className="text-sm text-gray-500">
                {animatedProcessed}/{campaign.recipients.length} {campaign.status}
            </span>
        </div>
    );
});