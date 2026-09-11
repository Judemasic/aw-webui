import { prettyScreenName, screenRowName, windowRowName } from '~/util/screenNames';

describe('prettyScreenName', () => {
  it('drops the package and splits the class name into words', () => {
    expect(prettyScreenName('com.whatsapp.calling.ui.VoipActivityV2')).toBe('Voip Activity V2');
    expect(prettyScreenName('com.sec.android.app.launcher.Launcher')).toBe('Launcher');
    expect(prettyScreenName('com.whatsapp.home.ui.HomeActivity')).toBe('Home Activity');
  });

  it('keeps the Activity suffix, so two different screens stay two names', () => {
    // Stripping it as noise would make `...Home` and `...HomeActivity` read identically.
    expect(prettyScreenName('com.x.Home')).not.toBe(prettyScreenName('com.x.HomeActivity'));
  });

  it('keeps an acronym together', () => {
    expect(prettyScreenName('com.x.HTTPServerActivity')).toBe('HTTP Server Activity');
  });

  it('reads an inner class as two names rather than one run-on word', () => {
    expect(prettyScreenName('com.x.Settings$SecurityActivity')).toBe(
      'Settings · Security Activity'
    );
  });

  it('leaves an obfuscated class exactly as it is', () => {
    // A single letter is less useful than the path it came from.
    expect(prettyScreenName('com.foo.a')).toBe('com.foo.a');
    expect(prettyScreenName('com.foo.ab')).toBe('com.foo.ab');
  });

  it('falls back to the app when there is no classname at all', () => {
    expect(prettyScreenName('', 'WhatsApp')).toBe('WhatsApp');
    expect(prettyScreenName(null, 'WhatsApp')).toBe('WhatsApp');
    expect(prettyScreenName(undefined)).toBe('');
  });

  it('never invents a name for a class that has none', () => {
    expect(prettyScreenName('Launcher')).toBe('Launcher');
  });
});

describe('screenRowName', () => {
  // The owner's request on first seeing the panel: "can the top screen have the app before it?
  // like youtube main activity". Half a dozen rows read "Main Activity" and nothing said whose.
  it('puts the app before the screen', () => {
    expect(screenRowName('com.google.android.youtube.app.MainActivity', 'YouTube')).toBe(
      'YouTube — Main Activity'
    );
  });

  it('keeps the two levels of nesting apart', () => {
    // An em dash between app and screen, the middle dot inside a nested class.
    expect(screenRowName('com.whatsapp.calling.ui.Voip$Inner', 'WhatsApp')).toBe(
      'WhatsApp — Voip · Inner'
    );
  });

  it('does not print the app twice when there is no screen to name', () => {
    expect(screenRowName('', 'Photos')).toBe('Photos');
    expect(screenRowName(null, 'Photos')).toBe('Photos');
  });

  it('still names the screen when the app is unknown', () => {
    expect(screenRowName('com.foo.HomeActivity')).toBe('Home Activity');
  });
});

describe('windowRowName', () => {
  it('puts the app before the window, like the Android rows', () => {
    expect(windowRowName('lib.rs - aw-server-rust', 'Code.exe')).toBe(
      'Code.exe — lib.rs - aw-server-rust'
    );
  });

  it('leaves a title that already ends in the application name alone', () => {
    // Most desktop windows name their own application, and the prefix would say it twice.
    expect(windowRowName('Inbox — Mozilla Firefox', 'firefox.exe')).toBe('Inbox — Mozilla Firefox');
    expect(windowRowName('Explorer', 'explorer.exe')).toBe('Explorer');
  });

  it('does not split camel case, because a title is already prose', () => {
    // The Android cleaner would turn this into something worse.
    expect(windowRowName('ReadMeFirst.md', 'Code.exe')).toBe('Code.exe — ReadMeFirst.md');
  });

  it('falls back to whichever half it has', () => {
    expect(windowRowName('', 'Code.exe')).toBe('Code.exe');
    expect(windowRowName(null, 'Code.exe')).toBe('Code.exe');
    expect(windowRowName('Untitled')).toBe('Untitled');
  });
});
