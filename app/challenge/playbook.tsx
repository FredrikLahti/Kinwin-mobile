import { Redirect } from 'expo-router';

// Backward-compatible route for older links. The former screen rendered
// session-only preview entries; the real product Playbook now lives here.
export default function LegacyPlaybookRedirect(){return <Redirect href="/playbook"/>;}
