"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@gamer-health/ui/tabs";

import { GamesTab } from "./games-tab";
import { HabitDefinitionsTab } from "./habit-definitions-tab";

export function ContentPageClient({ pageSize }: { pageSize: number }) {
  return (
    <Tabs defaultValue="games">
      <TabsList>
        <TabsTrigger value="games">Games</TabsTrigger>
        <TabsTrigger value="habits">Default habits</TabsTrigger>
      </TabsList>
      <TabsContent value="games" className="mt-6">
        <GamesTab pageSize={pageSize} />
      </TabsContent>
      <TabsContent value="habits" className="mt-6">
        <HabitDefinitionsTab />
      </TabsContent>
    </Tabs>
  );
}
