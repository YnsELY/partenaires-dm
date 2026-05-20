import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

/**
 * Ouvre une URL externe (PDF, lien) de la manière la plus fiable possible
 * sur iOS comme sur Android. Préfère le navigateur embarqué (SFSafariView /
 * Chrome Custom Tabs) qui marche y compris quand `Linking.openURL` échoue
 * (simulateur sans Safari config, etc.). Fallback sur Linking en dernier
 * recours.
 */
export async function openUrl(url: string): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      showTitle: true,
    });
  } catch {
    // Fallback ultime : tentative via Linking
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else throw new Error('Impossible d\'ouvrir le lien sur cet appareil.');
  }
}
