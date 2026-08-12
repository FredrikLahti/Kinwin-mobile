export function buildInvitationShareContent(introduction: string, url: string): { readonly message: string } {
  return { message: `${introduction.trim()} ${url}` };
}
