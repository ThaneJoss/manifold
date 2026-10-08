const paths = {
  arrow: <path d="M5 19 19 5M6 5h13v13" />,
  pen: <path d="m14 5 5 5M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z" />,
  trash: <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  play: <path d="m9 5 11 7-11 7Z" />,
  pause: <path d="M9 5v14M16 5v14" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
};

export default function Icon({ name, ...props }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>{paths[name]}</svg>;
}
