'use client';

import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import React, { createContext, useContext, useMemo, useState } from 'react';
import { clsx } from 'clsx';

type SidebarContextValue = {
  open: boolean;
  openMobile: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  toggleSidebar: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}

export function SidebarProvider({ children, defaultOpen = true }: { children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const value = useMemo(() => ({
    open,
    openMobile,
    setOpen,
    setOpenMobile,
    toggleSidebar: () => {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
        setOpenMobile((value) => !value);
      } else {
        setOpen((value) => !value);
      }
    },
  }), [open, openMobile]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function Sidebar({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, openMobile, setOpen, setOpenMobile } = useSidebar();
  return (
    <>
      <div className={clsx('sidebar-backdrop', openMobile && 'is-open')} onClick={() => setOpenMobile(false)} />
      <aside className={clsx('sh-sidebar', open ? 'is-expanded' : 'is-collapsed', openMobile && 'is-mobile-open', className)}>
        {children}
        {!openMobile ? (
          <button className="sh-sidebar-dock-trigger" type="button" onClick={() => setOpen(!open)} aria-label="Collapse sidebar" title="Collapse sidebar">
            {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        ) : null}
      </aside>
    </>
  );
}

export function SidebarHeader({ children }: { children: React.ReactNode }) {
  const { openMobile, setOpenMobile } = useSidebar();
  return (
    <div className="sh-sidebar-header">
      {children}
      {openMobile ? (
        <button className="sh-icon-button sh-mobile-close" type="button" onClick={() => setOpenMobile(false)} aria-label="Close sidebar">
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

export function SidebarContent({ children }: { children: React.ReactNode }) {
  return <div className="sh-sidebar-content">{children}</div>;
}

export function SidebarFooter({ children }: { children: React.ReactNode }) {
  return <div className="sh-sidebar-footer">{children}</div>;
}

export function SidebarGroup({ children }: { children: React.ReactNode }) {
  return <section className="sh-sidebar-group">{children}</section>;
}

export function SidebarGroupLabel({ children, asChild = false }: { children: React.ReactNode; asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) return children;
  return <div className="sh-sidebar-group-label">{children}</div>;
}

export function SidebarGroupContent({ children }: { children: React.ReactNode }) {
  return <div className="sh-sidebar-group-content">{children}</div>;
}

export function SidebarMenu({ children }: { children: React.ReactNode }) {
  return <ul className="sh-sidebar-menu">{children}</ul>;
}

export function SidebarMenuItem({ children }: { children: React.ReactNode }) {
  return <li className="sh-sidebar-menu-item">{children}</li>;
}

export function SidebarMenuButton({ children, active = false, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return <button className={clsx('sh-sidebar-menu-button', active && 'is-active')} type="button" onClick={onClick}>{children}</button>;
}

export function SidebarInset({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();
  return <div className={clsx('sh-sidebar-inset', open ? 'with-sidebar' : 'with-icon-sidebar')}>{children}</div>;
}

export function SidebarTrigger() {
  const { open, toggleSidebar } = useSidebar();
  return (
    <button className="sh-trigger" type="button" onClick={toggleSidebar} aria-label="Toggle sidebar" title="Toggle sidebar">
      {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
    </button>
  );
}

export function SidebarCollapseTrigger() {
  const { open, openMobile, setOpen } = useSidebar();
  if (openMobile) return null;
  return (
    <button className="sh-trigger" type="button" onClick={() => setOpen(!open)} aria-label="Collapse sidebar" title="Collapse sidebar">
      {open ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
    </button>
  );
}

export function SidebarRail() {
  const { open, setOpen } = useSidebar();
  return <button className="sh-sidebar-rail" type="button" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={() => setOpen(!open)} />;
}
