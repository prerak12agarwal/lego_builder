"use client";

/* Full page links cross workspace boundaries; sample/Admin clicks preserve local state. */
/* eslint-disable @next/next/no-html-link-for-pages */

import type { ReactNode } from "react";
import { Box, FolderOpen, House, Plus, Upload } from "lucide-react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

export type WorkshopView = "sample" | "admin" | "build";

function Navigation({ current, onNavigate }: { current: WorkshopView; onNavigate?: (view: "sample" | "admin") => void }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  function go(event: React.MouseEvent<HTMLAnchorElement>, view: "sample" | "admin") {
    close();
    if (onNavigate && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) {
      event.preventDefault(); onNavigate(view);
    }
  }
  return <Sidebar className="workshop-sidebar">
    <SidebarHeader>
      <a className="brand side-brand" href="/" onClick={event => go(event, "sample")} aria-label="LEGO Builder home"><Box size={34}/><span><strong>LEGO</strong> Builder</span></a>
      <a className="primary new-project" href="/build?new=1" onClick={close}><Plus size={20}/> New project</a>
    </SidebarHeader>
    <SidebarContent>
      <nav className="side-nav" aria-label="Main navigation">
        <a className={current === "build" ? "active" : ""} href="/build" onClick={close}><FolderOpen size={20}/> My projects</a>
        <a className={current === "sample" ? "active" : ""} href="/" onClick={event => go(event, "sample")}><Box size={20}/> Sample workbench</a>
        <a className={current === "admin" ? "active" : ""} href="/?view=admin" onClick={event => go(event, "admin")}><Upload size={20}/> Admin test bench</a>
      </nav>
      <div className="side-section"><div className="side-label">CURRENT SAMPLE</div>
        <a className="sample-card" href="/" onClick={event => go(event, "sample")}><div className="sample-icon"><House size={32}/></div><span><strong>Little house</strong><small>Hand-authored sample</small></span></a>
        <p className="side-note">A small build to explore the workbench.</p>
      </div>
    </SidebarContent>
    <SidebarFooter><div className="side-bottom"><span className="preview-pill">UI PREVIEW</span><p>Made for your next little project.</p></div></SidebarFooter>
  </Sidebar>;
}

export function WorkshopNavigation({ current, onNavigate }: { current: WorkshopView; onNavigate?: (view: "sample" | "admin") => void }) {
  return <Navigation current={current} onNavigate={onNavigate}/>;
}

export function WorkshopShell({ current, children }: { current: WorkshopView; children: ReactNode }) {
  const title = current === "build" ? "My projects" : current === "admin" ? "Admin test bench" : "Little house";
  return <SidebarProvider style={{ "--sidebar-width": "248px" } as React.CSSProperties}>
    <Navigation current={current}/>
    <div className="main-shell">
      <header className="workspace-header"><div className="mobile-menu"><SidebarTrigger/></div><div className="breadcrumb">Your workshop <span>/</span> <strong>{title}</strong></div><span className="top-preview">{current === "build" ? "Private project workspace" : "Sample-first preview"}</span></header>
      {children}
    </div>
  </SidebarProvider>;
}
