import { FileText, LogOut, SquareTerminal, Terminal } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

type SidebarDocument = {
  id: string;
  title: string;
  role: string;
  visibility: string;
};

type SidebarUser = {
  name: string;
  email: string;
  image?: string | null;
};

export function AppSidebar({
  documents,
  activeDocumentId,
  user,
  ...props
}: {
  documents: SidebarDocument[];
  activeDocumentId?: string | null;
  user: SidebarUser | null;
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <SquareTerminal className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">ShareMyMarkdown</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Documents</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {documents.map((doc) => (
                <SidebarMenuItem key={doc.id}>
                  <SidebarMenuButton isActive={doc.id === activeDocumentId} asChild>
                    <a href={`/documents/${doc.id}`}>
                      <FileText />
                      {doc.title}
                    </a>
                  </SidebarMenuButton>
                  {doc.visibility !== "private" && (
                    <SidebarMenuBadge>{doc.visibility === "public" ? "pub" : "link"}</SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              ))}
              {documents.length === 0 && (
                <div className="px-2 py-4 text-xs text-muted-foreground">
                  <p>No documents yet.</p>
                  <p className="mt-1">Use the CLI or MCP to create documents.</p>
                </div>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <a href="https://www.npmjs.com/package/sharemymarkdown" target="_blank" rel="noopener noreferrer">
                <Terminal />
                Get the CLI
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {user && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton className="pointer-events-none">
                  {user.image && <img src={user.image} alt="" className="size-5 rounded-full" />}
                  <span className="truncate text-xs">{user.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a href="/auth/signout?callback=/">
                    <LogOut />
                    Sign out
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
