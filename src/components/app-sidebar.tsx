import { FileText, LogOut, Plus, SquareTerminal } from "lucide-react";

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
  onCreateDocument,
  ...props
}: {
  documents: SidebarDocument[];
  activeDocumentId?: string | null;
  user: SidebarUser | null;
  onCreateDocument: () => void;
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
                <p className="px-2 py-4 text-xs text-muted-foreground">No documents yet.</p>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onCreateDocument}>
              <Plus />
              New document
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
