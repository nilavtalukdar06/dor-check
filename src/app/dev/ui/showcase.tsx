"use client";

import { SearchIcon } from "lucide-react";
import { OrbCard } from "@/components/common/orb-card";
import { StatCard } from "@/components/common/stat-card";
import { ToolChip } from "@/components/common/tool-chip";
import { Waveform } from "@/components/common/waveform";
import { PriceRange } from "@/components/common/price-range";
import { EvidenceCard } from "@/components/investigation/evidence-card";
import { StepTimeline } from "@/components/investigation/step-timeline";
import {
  ListSkeleton,
  LoadingState,
  StatRowSkeleton,
  TableSkeleton,
} from "@/components/shell/loading";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function UiShowcase() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">UI kit</h1>
        <p className="text-muted-foreground">
          Tokens and components, matched to the reference screens.
        </p>
      </header>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Compare price</Button>
          <Button variant="outline">Feedback</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Cancel</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge variant="danger">Suspicious</Badge>
          <Badge variant="ok">Verified match</Badge>
          <Badge variant="warning">Moderate</Badge>
          <Badge variant="info">Running</Badge>
          <Badge variant="outline">Listed</Badge>
          <Badge variant="secondary">3</Badge>
          <ToolChip kind="event">sources_found</ToolChip>
          <ToolChip>firecrawl.search</ToolChip>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input placeholder="Guwahati airport" />
          <div className="relative">
            <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search the directory" />
          </div>
          <Textarea className="sm:col-span-2" placeholder="Paste a link or message" />
          <div className="flex items-center gap-3">
            <Switch defaultChecked />
            <span className="text-sm">Auto-read results</span>
          </div>
          <Slider defaultValue={[50]} />
        </div>
        <Tabs defaultValue="taxi">
          <TabsList>
            <TabsTrigger value="taxi">Taxi</TabsTrigger>
            <TabsTrigger value="stay">Stay</TabsTrigger>
            <TabsTrigger value="guide">Guide</TabsTrigger>
            <TabsTrigger value="tour">Tour</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs defaultValue="all">
          <TabsList variant="line">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="stays">Stays</TabsTrigger>
            <TabsTrigger value="taxis">Taxis</TabsTrigger>
          </TabsList>
        </Tabs>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <OrbCard tone={0} title="Check a booking" description="Link, name or pasted message" />
          <OrbCard tone={1} title="Check a price" description="Compare a quote with a range" />
          <OrbCard tone={2} title="Ask the assistant" description="Assamese, Hindi or English" />
          <OrbCard tone={3} title="Report an incident" description="Type it or say it aloud" />
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Investigations" value={12} />
          <StatCard label="Suspicious found" value={3} />
          <StatCard label="Reports followed" value={2} />
          <StatCard label="Evidence captures" value={9} />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Current usage</CardTitle>
            <CardDescription>Investigations this month</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-2xl font-semibold">
              12 <span className="text-sm font-normal text-muted-foreground">/ 50</span>
            </p>
            <Progress value={24} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Price range">
        <Card>
          <CardContent>
            <PriceRange low={2200} high={3000} quote={4800} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Step timeline">
        <Card>
          <CardContent>
            <StepTimeline
              steps={[
                { title: "Understand the request", status: "done", duration: "0.4s", events: ["research_started"], tools: ["parseInput"] },
                { title: "Capture the page", status: "done", duration: "9.8s", tools: ["browserbase.screenshot"] },
                { title: "Retrieve known benchmarks", status: "running", events: ["benchmark_calculated"], tools: ["pinecone.query"] },
                { title: "Compare and analyse", status: "waiting", tools: ["generateObject"] },
              ]}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Evidence and waveform">
        <div className="grid gap-4 sm:grid-cols-3">
          <EvidenceCard title="Listing page" subject="Hotel Kaziranga Retreat" timestamp="10 Oct 10:41:19" kind="screenshot" />
          <EvidenceCard title="Directory lookup" subject="Hotel Kaziranga Retreat" timestamp="10 Oct 10:41:33" kind="extract" />
          <EvidenceCard title="Voice note" subject="TTD-7K2M9Q" timestamp="8 Oct 19:12" kind="audio" />
        </div>
        <Card>
          <CardContent>
            <Waveform progress={0.4} />
          </CardContent>
        </Card>
      </Section>

      <Section title="Loading states">
        <div className="flex flex-col gap-4">
          <LoadingState text="Loading your investigations…" />
          <StatRowSkeleton />
          <TableSkeleton rows={3} />
          <ListSkeleton rows={2} />
        </div>
      </Section>

      <Section title="Misc">
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>N</AvatarFallback>
          </Avatar>
          <Separator orientation="vertical" className="h-6" />
          <Skeleton className="h-6 w-40" />
        </div>
      </Section>
    </main>
  );
}
