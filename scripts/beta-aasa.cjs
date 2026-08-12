const EXPECTED_BUNDLE_ID = 'com.kinwin.mobile.beta';
const APPLE_TEAM_ID_PATTERN = /^[A-Z0-9]{10}$/;
const PLACEHOLDER_PATTERN = /TEAM|XXXX|SAMPLE|EXAMPLE|PLACEHOLDER/;
const ALL_SAME_CHARACTER_PATTERN = /^(.)\1{9}$/;

function isPlaceholderTeamId(teamId) {
  return ALL_SAME_CHARACTER_PATTERN.test(teamId) || PLACEHOLDER_PATTERN.test(teamId);
}

function buildAasaDocument(teamId) {
  if (typeof teamId !== 'string' || !APPLE_TEAM_ID_PATTERN.test(teamId)) {
    throw new Error('A real 10-character Apple Team ID (KINWIN_APPLE_TEAM_ID) is required to generate the AASA file.');
  }
  if (isPlaceholderTeamId(teamId)) {
    throw new Error('KINWIN_APPLE_TEAM_ID looks like a placeholder, not a real Apple Team ID.');
  }
  const appId = `${teamId}.${EXPECTED_BUNDLE_ID}`;
  return {
    applinks: {
      details: [
        {
          appID: appId,
          appIDs: [appId],
          components: [{ '/': '/invite/*' }],
        },
      ],
    },
  };
}

module.exports = { EXPECTED_BUNDLE_ID, APPLE_TEAM_ID_PATTERN, isPlaceholderTeamId, buildAasaDocument };
