/**
 * Inline SVG icon set.
 *
 * Every icon is a stroke path on a 24×24 grid using `currentColor`, so an icon
 * inherits the colour of whatever button or label it sits in and needs no
 * per-theme variant. Inlined rather than shipped as an icon font or sprite:
 * there is no network in this app, and a sprite request would be a request.
 */

export type IconName =
  | 'select'
  | 'hand'
  | 'pen'
  | 'eraser'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'note'
  | 'image'
  | 'undo'
  | 'redo'
  | 'trash'
  | 'copy'
  | 'group'
  | 'ungroup'
  | 'bringFront'
  | 'sendBack'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'grid'
  | 'sun'
  | 'moon'
  | 'save'
  | 'plus'
  | 'folder'
  | 'download'
  | 'upload'
  | 'close'
  | 'chevronDown'
  | 'chevronRight'
  | 'panel'
  | 'keyboard'
  | 'check'
  | 'alert'
  | 'info'
  | 'edit'
  | 'search'

const PATHS: Record<IconName, string[]> = {
  select: ['M5 3l6.5 16 2.3-6.2L20 10.5z'],
  hand: [
    'M8 13V5.5a1.5 1.5 0 0 1 3 0V12',
    'M11 11.5V4.5a1.5 1.5 0 0 1 3 0V12',
    'M14 12V6.5a1.5 1.5 0 0 1 3 0V14',
    'M17 11.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-2.5a1.5 1.5 0 0 1 3 0'
  ],
  pen: ['M3.5 20.5l4-1L19 8a2.5 2.5 0 0 0-3.5-3.5L4 16z', 'M14.5 6.5l3 3'],
  eraser: [
    'M9.5 20.5H21',
    'M13.8 4.2l5 5a1.8 1.8 0 0 1 0 2.6l-7.2 7.2H6.2l-2.4-2.4a1.8 1.8 0 0 1 0-2.6l7.4-7.4a1.8 1.8 0 0 1 2.6 0z'
  ],
  text: ['M4 7V4.5h16V7', 'M12 4.5v15', 'M8.5 19.5h7'],
  rect: ['M4 5.5h16v13H4z'],
  ellipse: ['M12 4.5c4.4 0 8 3.4 8 7.5s-3.6 7.5-8 7.5-8-3.4-8-7.5 3.6-7.5 8-7.5z'],
  line: ['M4 20L20 4'],
  arrow: ['M4 20L20 4', 'M13 4h7v7'],
  note: ['M5 4h14v11.5L13.5 20H5z', 'M19 15.5h-5.5V20'],
  image: ['M4 5h16v14H4z', 'M4 15.5l4.5-4.5 3 3 3.5-3.5 5 5', 'M9 9.5a.6.6 0 1 1-1.2 0 .6.6 0 0 1 1.2 0z'],
  undo: ['M4 9h11a5 5 0 0 1 0 10h-6', 'M8 5L4 9l4 4'],
  redo: ['M20 9H9a5 5 0 0 0 0 10h6', 'M16 5l4 4-4 4'],
  trash: ['M4 7h16', 'M9.5 7V4.5h5V7', 'M6.5 7l1 13h9l1-13', 'M10.5 11v6', 'M13.5 11v6'],
  copy: ['M8.5 8.5h11v11h-11z', 'M15.5 5.5h-11v11h3'],
  group: ['M9.5 12h5', 'M8 8H6a4 4 0 0 0 0 8h2', 'M16 8h2a4 4 0 0 1 0 8h-2'],
  ungroup: ['M9.5 12h5', 'M8 8H6a4 4 0 0 0 0 8h2', 'M16 8h2a4 4 0 0 1 0 8h-2', 'M4 4l16 16'],
  bringFront: ['M12 20.5V8.5', 'M6.5 14l5.5-5.5L17.5 14', 'M4 4h16'],
  sendBack: ['M12 3.5v12', 'M6.5 10l5.5 5.5L17.5 10', 'M4 20h16'],
  zoomIn: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M8 11h6'],
  fit: ['M4 9.5V4h5.5', 'M14.5 4H20v5.5', 'M20 14.5V20h-5.5', 'M9.5 20H4v-5.5'],
  grid: ['M4 9.5h16', 'M4 14.5h16', 'M9.5 4v16', 'M14.5 4v16'],
  sun: [
    'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
    'M12 2v2.5',
    'M12 19.5V22',
    'M4.2 4.2l1.8 1.8',
    'M18 18l1.8 1.8',
    'M2 12h2.5',
    'M19.5 12H22',
    'M4.2 19.8L6 18',
    'M18 6l1.8-1.8'
  ],
  moon: ['M20 14.2A8.6 8.6 0 0 1 9.8 4 8.6 8.6 0 1 0 20 14.2z'],
  save: ['M5 4.5h11l3 3V20H5z', 'M9 4.5V10h6V4.5', 'M8 20v-6h8v6'],
  plus: ['M12 5.5v13', 'M5.5 12h13'],
  folder: ['M4 6.5h5l2 2h9V19H4z'],
  download: ['M12 4v10.5', 'M7.5 11l4.5 4.5L16.5 11', 'M4 19.5h16'],
  upload: ['M12 19.5V9', 'M7.5 13L12 8.5 16.5 13', 'M4 4.5h16'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  chevronDown: ['M6 9.5l6 6 6-6'],
  chevronRight: ['M9.5 6l6 6-6 6'],
  panel: ['M4 5h16v14H4z', 'M10 5v14'],
  keyboard: ['M3 7h18v10H3z', 'M7 11h.01', 'M11 11h.01', 'M15 11h.01', 'M8 14h8'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  alert: ['M12 4l9 16H3z', 'M12 10v4.5', 'M12 17.5h.01'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.8h.01'],
  edit: ['M4 20h4l11-11a2.4 2.4 0 0 0-3.4-3.4L4.6 16.6z', 'M14.5 6.5l3.4 3.4'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20.5 20.5l-4-4']
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 18, className }: IconProps): React.JSX.Element {
  const paths = PATHS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
