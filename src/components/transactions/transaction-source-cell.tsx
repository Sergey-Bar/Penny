export function getAccountDisplayLabel(
  providerName: string,
  accountLabel: string | null,
): { primary: string; secondary: string | null } {
  const labelDistinct =
    accountLabel != null &&
    accountLabel.trim() !== "" &&
    accountLabel.trim().toLowerCase() !== providerName.trim().toLowerCase();
  return {
    primary: labelDistinct ? accountLabel.trim() : providerName,
    secondary: labelDistinct ? providerName : null,
  };
}
