import type { TPanelType } from '@/types/terminal';

const VIRTUAL_PANEL_TYPES = new Set<TPanelType>(['web-browser', 'document-editor']);

export const panelUsesTmux = (panelType: TPanelType | undefined): boolean =>
  !panelType || !VIRTUAL_PANEL_TYPES.has(panelType);

export const getPanelTmuxSession = (
  panelType: TPanelType | undefined,
  sessionName: string | null | undefined,
): string | null => panelUsesTmux(panelType) ? sessionName ?? null : null;

export const isVirtualPanelType = (panelType: TPanelType | undefined): boolean =>
  panelType !== undefined && VIRTUAL_PANEL_TYPES.has(panelType);
