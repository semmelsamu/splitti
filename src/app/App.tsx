// The one React island: decides from the path which screen to show.

import type { ReactNode } from 'react';
import { GroupRoot } from './group';
import { Link, matchPath, usePath } from './router';
import { CreateGroup } from './screens/CreateGroup';
import { Overview } from './screens/Overview';
import { Settings } from './screens/Settings';
import { Start } from './screens/Start';
import { Screen } from './ui';

/** Screens inside a group, by the path below /g/:token. */
const GROUP_SCREENS: { pattern: string; render: (params: Record<string, string>) => ReactNode }[] =
  [
    { pattern: '/g/:token', render: () => <Overview /> },
    { pattern: '/g/:token/einstellungen', render: () => <Settings /> },
  ];

export default function App() {
  const path = usePath();

  if (path === '/') return <Start />;
  if (matchPath('/neu', path)) return <CreateGroup />;

  for (const screen of GROUP_SCREENS) {
    const params = matchPath(screen.pattern, path);
    if (params?.token) {
      // The key makes switching between two groups start from a clean state.
      return (
        <GroupRoot key={params.token} token={params.token}>
          {screen.render(params)}
        </GroupRoot>
      );
    }
  }

  return (
    <Screen title="Splitti" titleAs="div">
      <div className="flex flex-col gap-4 p-4">
        <h1 className="m-0 text-2xl font-semibold">Seite nicht gefunden</h1>
        <p className="m-0 text-sm text-muted">Diese Adresse gibt es in Splitti nicht.</p>
        <Link to="/" className="font-semibold text-accent">
          Zur Startseite
        </Link>
      </div>
    </Screen>
  );
}
