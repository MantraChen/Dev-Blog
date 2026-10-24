/** @param {string} content */
export function extractPostLinks(content) {
  return [
    ...new Set(
      [
        ...content.matchAll(
          /(?:^|[\s("'])\/(?:howielog\/)?blog\/([a-z0-9]+(?:-[a-z0-9]+)*)|https?:\/\/(?:howielog\.com|dyyjs\.com)\/(?:howielog\/)?blog\/([a-z0-9]+(?:-[a-z0-9]+)*)/g,
        ),
      ].map((match) => match[1] || match[2]),
    ),
  ];
}
