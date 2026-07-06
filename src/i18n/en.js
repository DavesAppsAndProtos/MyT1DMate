/**
 * My T1D Mate — i18n strings
 * Language: English (en)
 * Session 17: Full sweep — all user-facing strings migrated.
 *
 * Session 18: LibreLinkUp strings added. GDH strings retired (kept as comments).
 *
 * GDH/GDA step body copy lives in ChatScreen.js as content constants — not here.
 *
 * Usage:
 *   import { t } from '../i18n/en';
 *   <Text>{t('back')}</Text>
 */

const strings = {

  // ── App ────────────────────────────────────────────────────────────────────
  appName:          'My T1D Mate',
  version:          'Version 1.1.0',
  aboutCredits:     'Built by Sarah Short\nDevelopment: DavesAppsAndProtos, with AI collaboration (Claude, Anthropic)',
  contactEmail:     'myt1dmate@gmail.com',

  // ── Navigation ────────────────────────────────────────────────────────────
  back:             '← Back',
  backDashboard:    '← Dashboard',
  backChat:         '← Chat',
  backHTT:          '← HTT',
  done:             'Done',
  next:             'Next →',
  letsGo:           "Let's go →",
  skip:             '⏩ Skip',

  // ── Common actions ────────────────────────────────────────────────────────
  cancel:           'Cancel',
  save:             'Save',
  send:             'Send',
  reset:            'Reset',
  agree:            'Agree & Continue',
  ok:               'OK',
  delete:           'Delete',
  replace:          'Replace',
  goToSettings:     'Go to Settings',
  notNow:           'Not now',
  comingSoon:       'Coming soon',
  emailSupport:     'Email support',

  // ── Menu / drawer ─────────────────────────────────────────────────────────
  menuTitle:        'MENU',
  menuSettings:     'T1D Settings',
  // v1.1.0: Notifications and Accessibility removed as standalone drawer
  // items — both relocated into the Coming Soon list below (menuComingSoon).
  // menuNotifs:    'Notifications',
  // menuAccess:    'Accessibility',
  // v1.1.0: Customise Dashboard commented out, not deleted — the toggle
  // mechanism (DashboardScreen ALL_TILES / tileVisibility) is left intact
  // and this will come back once Exercise/Morning/Chat land and toggling
  // is meaningful again. Also now listed under Coming Soon.
  // menuCustomise: 'Customise Dashboard',
  menuComingSoon:   'Coming Soon',
  menuKnownIssues:  'Known Issues', // v1.1.0
  menuPrivacy:      'Privacy Notice',
  menuTerms:        'View Terms',
  menuReplayTour:   'Replay Tour',
  menuAbout:        'About',

  // ── About alert ───────────────────────────────────────────────────────────
  aboutTitle:       'My T1D Mate',

  // ── Coming Soon screen (v1.1.0) ───────────────────────────────────────────
  // Static informational list — no toggles. Reframes the app as
  // user-shapeable rather than "features we haven't built yet hidden as
  // broken toggles".
  comingSoonScreenTitle: 'Coming Soon',
  comingSoonScreenIntro: "This app is shaped by what you need. Here's what's on the way:",
  comingSoonItemExercise:      'Exercise tracking',
  comingSoonItemMorning:       'Morning routine',
  comingSoonItemReports:       'Reports',
  comingSoonItemPolling:       'Adaptive polling',
  comingSoonItemChat:          'Chat (premium)',
  comingSoonItemNotifications: 'Notifications',
  comingSoonItemAccessibility: 'Accessibility',
  comingSoonItemCustomise:     'Customise Dashboard',

  // ── Known Issues screen (v1.1.0) ──────────────────────────────────────────
  // Main app only — Auto has no separate copy, inherits this via shared
  // display logic. This is the single place to update when the polling
  // fix or threshold-matching ships.
  knownIssuesScreenTitle: 'Known Issues',
  knownIssuesItem1Title: 'Background polling can pause',
  knownIssuesItem1Body:  'Background polling can occasionally pause when the app is backgrounded for extended periods. If you see a ? on the status bar, the reading may be stale — just open the app to refresh.',
  knownIssuesItem2Title: "Colour thresholds don't yet match LibreLink",
  knownIssuesItem2Body:  "My T1D Mate's amber/red bands aren't currently aligned with LibreLink's own alert levels — a reading may show differently between the two apps. Always check your official LibreLink app for glucose alerts and treatment decisions. Threshold matching is planned for a future release.",

  // ── Dashboard tiles ───────────────────────────────────────────────────────
  tileChat:         'Chat',
  tileHTT:          'Hold That Thought',
  tileDose:         'Dose Calc',
  tileWeight:       'Weight Tracker',
  tileExercise:     'Exercise',
  tileMorning:      'Morning',
  tileAuto:         'Android Auto',
  tileSuggest:      'Shape This App',

  // ── Customise dashboard ───────────────────────────────────────────────────
  customiseTitle:   '🎛️  Customise Dashboard',
  customiseHint:    'Toggle tiles on or off. Changes take effect immediately.',

  // ── Android Auto alert ────────────────────────────────────────────────────
  androidAutoTitle: 'Android Auto',
  androidAutoBody:  "My T1D Mate now connects to Android Auto. Install My T1D Mate Auto and plug in — your glucose reading appears right on your car's dashboard, no separate login needed.",
  androidAutoGetItBtn: 'Get it here',

  // ── HTT ───────────────────────────────────────────────────────────────────
  httTitle:         '📌  Hold That Thought',
  httPlaceholder:   'What do you want to remember?',
  httMyPins:        'My pins',
  httManagerTitle:  'My Pins',
  httEmpty:         "No pins yet.\n\nTap the HTT tile and save a thought — it'll appear here.",
  httDeleteTitle:   'Delete pin?',
  httDeleteSuffix:  "\n\nThis can't be undone.",
  httCouldNotSave:  'Could not save',
  httSaveError:     'Pin save failed. Try again.',

  // ── Dose calc ─────────────────────────────────────────────────────────────
  doseTitle:        '💉  Dose Calculator',
  doseCalcBtn:      'Calc',
  doseSuggested:    'Starting point',
  doseUnits:        'units',
  doseDisclaimer:   'This calculation should be used as a starting point only. Always use your own judgement.',
  doseRatioFor:     'Your ratio for',
  doseRatioNotSet:  'Not set — tap to add in Settings',
  doseEnterCarbs:   'Enter carbs',
  doseEnterCarbsMsg:'Type the number of carbs first.',
  doseNoRatioTitle: 'No ratio set',
  doseNoRatioMsg:   "You haven't set your ratio for %period% yet. Head to Settings to add it.",
  doseCarbsLabel:   'Carbs (g)',
  dosePeriodBreakfast: 'Breakfast',
  dosePeriodLunch:     'Lunch',
  dosePeriodEvening:   'Evening',
  dosePeriodOvernight: 'Overnight',

  // ── Shape This App ────────────────────────────────────────────────────────
  suggestTitle:       '💡  Shape This App',
  suggestIntro:       "We're building this for you. What would make it genuinely useful in your day?",
  suggestPlaceholder: "I'd love to see…",
  suggestEmailSubject:'T1D Mate — Feature suggestion',
  suggestErrorTitle:  'Add your thoughts',
  suggestErrorBody:   "Tell us what you'd like to see — anything helps.",
  suggestErrorEmail:  'No email app found. Email us at myt1dmate@gmail.com.',

  // ── Feedback ─────────────────────────────────────────────────────────────
  feedbackTitle:      '✉️  Send Feedback',
  feedbackBug:        '🐛 Bug',
  feedbackSuggestion: '💡 Suggestion',
  feedbackPickType:   'Pick a type',
  feedbackPickTypeMsg:'Bug report or suggestion?',
  feedbackNeedDetail: 'Add some detail',
  feedbackDetailMsg:  'A little detail helps a lot.',
  feedbackEmailSubjectBug: 'T1D Mate — Bug report',
  feedbackEmailSubjectSug: 'T1D Mate — Suggestion',
  feedbackNoEmail:    'Could not open email',
  feedbackNoEmailMsg: 'Email us at myt1dmate@gmail.com.',
  feedbackSendBtn:    'Send',
  feedbackPlaceholder:"Tell us what happened or what you'd like…",

  // ── Settings feedback modal ───────────────────────────────────────────────
  settingsFeedbackTitle:    'Send feedback',
  settingsFeedbackHint:     'Goes straight to myt1dmate@gmail.com — we read every one.',
  settingsFeedbackBugBtn:   '🐛  Bug report',
  settingsFeedbackSugBtn:   '💡  Suggestion',
  settingsFeedbackBugPh:    'What went wrong? Steps to reproduce help a lot…',
  settingsFeedbackSugPh:    'What would make T1D Mate more useful for you?',
  settingsFeedbackSendBtn:  'Send',
  settingsFeedbackOpening:  'Opening email…',
  settingsFeedbackSendBtn2: '✉️  Send feedback',
  settingsFeedbackNoEmail:  'No email app found. You can email us directly at myt1dmate@gmail.com.',

  // ── Settings ─────────────────────────────────────────────────────────────
  settingsTitle:          'Settings',
  settingsSubtitle:       'Your profile grows with you.',
  settingsSaveBtn:        'Save changes',
  settingsSaving:         'Saving…',
  settingsSaved:          'Saved',
  settingsSavedMsg:       'Your profile has been updated.',
  settingsNameRequired:   'Name required',
  settingsNameRequiredMsg:'I still need your name to work properly.',
  settingsSaveError:      'Something went wrong',
  settingsSaveErrorMsg:   'Could not save. Please try again.',
  settingsResetBtn:       'Reset defaults',
  settingsResetTitle:     'Reset defaults',
  settingsResetMsg:       'This will clear all your settings. Are you sure?',
  settingsResetError:     'Could not save reset. Please try again.',

  settingsLabelName:          'Name',
  settingsPlaceholderName:    'First name',
  settingsLabelYearsWithT1D:  'How long with T1D?',
  settingsLabelExperience:    'Your T1D experience',
  settingsHintExperience:     'Helps us pitch things at the right level for you.',
  settingsLabelBolus:         'Bolus (rapid-acting) insulin',
  settingsLabelBasal:         'Basal (background) insulin',
  settingsLabelDelivery:      'Delivery method',
  settingsLabelICRatios:      'Insulin to carb ratios',
  settingsHintICRatios:       'Set your insulin to carb ratio for each meal. e.g. 1:10 means 1 unit covers 10g of carbs.',
  settingsLabelCGM:           'CGM',
  settingsLabelCorrFactor:    'Correction factor',
  settingsHintCorrFactorMmol: 'How many mmol/L does 1 unit drop you?',
  settingsHintCorrFactorMgdl: 'How many mg/dL does 1 unit drop you?',
  settingsLabelGlucoseUnit:   'Glucose display unit',
  settingsHintGlucoseUnit:    'mmol/L is used in the UK and most of Europe. mg/dL is used in the US.',
  settingsLabelTargetRange:   'Target glucose range',
  settingsHintTargetMmol:     'Your low and high targets in mmol/L.',
  settingsHintTargetMgdl:     'Your low and high targets in mg/dL.',
  settingsLabelDawn:          'Dawn phenomenon',
  settingsHintDawn:           'Do you experience high glucose in the early morning hours (typically 3–8am)?',
  settingsLabelBattery:       'Battery optimisation',
  settingsHintBattery:        'My T1D Mate needs the same unrestricted battery access as your LibreLink app to keep glucose readings flowing in the background. Tap the button below, then:\n\nApp battery usage → Allow background usage → Unrestricted',
  settingsBatteryBtn:         '⚡  Disable battery optimisation',
  settingsBatteryManual:      'Open manually',
  settingsBatteryManualMsg:   'Go to Settings → Apps → My T1D Mate → App battery usage → Allow background usage → Unrestricted.',

  settingsColInsulin:   'INSULIN',
  settingsColCarbs:     'CARBS',
  settingsColLow:       'LOW',
  settingsColHigh:      'HIGH',

  settingsDawnNo:       'No',
  settingsDawnYesFixed: 'Yes, same time',
  settingsDawnVaries:   'Yes, time varies',
  settingsDawnTimeLabel:'Approximate start time:',

  settingsDeliveryPump: 'Pump',
  settingsDeliveryInj:  'Injections',

  settingsICBreakfast:  '🌅 Breakfast',
  settingsICLunch:      '☀️ Lunch',
  settingsICEvening:    '🌙 Evening meal',
  settingsICOvernight:  '💤 Overnight',

  // ── Weight ───────────────────────────────────────────────────────────────
  weightTitle:          'Weight Tracker',
  weightLastLogged:     'Last logged',
  weightUnit:           'UNIT',
  weightInput:          'WEIGHT',
  weightDate:           'DATE',
  weightLogBtn:         'Log weight',
  weightHistory:        'HISTORY',
  weightSaved:          'Saved',
  weightEnterTitle:     'Enter your weight',
  weightEnterMsg:       'Add stone and/or pounds.',
  weightEnterNumMsg:    'Type a number first.',
  weightCheckNum:       'Check that number',
  weightCheckNumMsg:    "That doesn't look right — try again.",
  weightExistsTitle:    'Entry already exists',
  weightCouldNotSave:   'Could not save',
  weightCouldNotSaveMsg:'Try again in a moment.',

  // ── Terms ────────────────────────────────────────────────────────────────
  termsTitle:     'Terms & Conditions',
  termsCheckbox:  'I have read and agree to these terms',
  termsAgreeBtn:  'Agree & Continue',

  // ── Chat ─────────────────────────────────────────────────────────────────
  chatPlaceholder:    'Ask me anything T1D…',
  chatTabChat:        'T1D Chat',
  chatTabCGM:         'CGM Setup',
  chatTyping:         'T1D Mate is thinking…',
  chatCopyMsg:        'Message copied',
  chatCopied:         'Copied',
  chatBackDashboard:  '← Dashboard',
  chatBackChat:       '← Chat',
  chatSettings:       '⚙️',
  chatScanClose:      'Close scanner',
  chatScanHint:       'Point at a food label barcode',
  chatVideoSoon:      'Video coming soon',
  chatVideoSoonMsg:   'This walkthrough video will be available before launch. Email us if you need help now.',
  chatCouldNotOpen:   'Could not open link',
  chatCouldNotOpenMsg:'Try searching on YouTube for the guide.',
  chatSwitchSource:   'Switch',
  chatUnsure:         "Not sure which? GDH is the most common — start there.",
  chatPickLabel:      'Which app are you setting up?',
  chatEmailFallback:  'Still stuck?',
  chatEmailFallbackBody: "We're here to help. Email us and we'll walk you through it.",
  chatEmailBtn:       'Email support',
  chatPlayStore:      '▶  Get on Play Store',
  chatWatchVideo:     '▶  ',

  // ── CGM Setup ────────────────────────────────────────────────────────────
  cgmTitle:           'CGM Setup',
  cgmIntroTitle:      'Connect your CGM to My T1D Mate',
  cgmGDHName:         'GDH',
  cgmGDHFull:         'Glucose Data Hub',
  cgmGDHSub:          'LibreLink · Dexcom',
  cgmGDAName:         'GDA',
  cgmGDAFull:         'Glucose Data Adapter',
  cgmGDASub:          'Alternative option',

  // ── Onboarding questions ─────────────────────────────────────────────────
  onboardingAppName:      'My T1D Mate',
  onboardingSubtitle:     'Almost there',
  onboardingIntro:        "Let's get to know you. It'll take two minutes and you can change any of this later.",
  onboardingFooter:       'You can update any of this later in Settings.',
  onboardingNextBtn:      'Next →',
  onboardingNoName:       'One thing first',
  onboardingNoNameMsg:    "I need your name. No name, no mate. 😄",
  onboardingSaveError:    'Something went wrong',
  onboardingSaveErrorMsg: 'Could not save your profile. Please try again.',

  onboardingQ1:       '1. What should I call you?',
  onboardingQ2:       '2. How long have you had T1D?',
  onboardingQ3:       '3. Which bolus (rapid-acting) insulin do you use?',
  onboardingQ4:       '4. Do you take a basal (background) insulin?',
  onboardingQ5:       '5. Do you use a pump or injections?',
  onboardingQ6:       '6. Do you use a CGM?',
  onboardingQ7:       "7. What's your insulin to carb ratio?",
  onboardingHintIC:   'Enter the carb number — e.g. 8 means 1 unit per 8g carbs. Same number for all meals is fine.',
  onboardingQ8:       "8. What's your correction factor?",
  onboardingHintCF:   'How many mmol/L does 1 unit drop you?',
  onboardingQ9:       "9. What's your target glucose range?",
  onboardingHintRange:'Your low and high targets in mmol/L.',

  // ── Disclaimer ───────────────────────────────────────────────────────────
  disclaimerTitle:    'Before we start',
  disclaimerMedical:  '⚕️ Medical',
  disclaimerMedBody:  'My T1D Mate is not a medical device and not a substitute for clinical advice. Dose suggestions are a starting point only — always apply your own judgement. If in doubt, speak to your diabetes team.',
  disclaimerNotAI:    '🧮 Not AI',
  disclaimerNotAIBody:"My T1D Mate is not an AI. I'm a calculator with a good memory. I look up carbs, do the maths, and remember what you tell me. That's it. No guessing. No AI.",
  disclaimerAgreeBtn: 'I understand — let\'s go',
  disclaimerBackBtn:  '← Back',

  // ── Onboarding tour ──────────────────────────────────────────────────────
  tourSlide1Title:  'Welcome to My T1D Mate',
  tourSlide1Body:   "You've got a T1D companion in your pocket. Let's show you around — it'll take about a minute.",
  tourSlide2Title:  'Your glucose, always visible',
  tourSlide2Body:   'The top of every screen shows your live CGM reading. Trend arrow, time stamp, all of it — right there.',
  tourSlide3Title:  'Hold That Thought',
  tourSlide3Body:   "That 3am brainwave. The thing you keep forgetting to say. Pin it before it's gone — HTT captures any thought in one tap.",
  tourSlide4Title:  'Dose Calculator',
  tourSlide4Body:   'Enter your carbs, get a starting point for your dose. Based on the ratio you set in Settings — your numbers, your way.',
  tourSlide5Title:  'Weight Tracker',
  tourSlide5Body:   'Log your weight and track trends over time. Your data stays on your device.',
  tourSlide6Title:  'Android Auto',
  tourSlide6Body:   'Glucose readings on your car dashboard, at a glance. Totally hands-free — one less thing to think about.',
  tourSlide7Title:  'Chat',
  tourSlide7Body:   'Coming soon — T1D Chat is on the way.',
  tourSlide8Title:  "You're all set",
  tourSlide8Body:   "Tap any tile to get started. Your data stays on your phone — private, always. Welcome to the team.",

  // ── Privacy notice ────────────────────────────────────────────────────────
  privacyTitle:         'Privacy Notice',
  privacyBack:          '← Back',
  privacyDate:          'Last updated: June 2026',
  privacyH1:            'Your data stays on your phone',
  privacyB1:            'My T1D Mate stores all your personal data — glucose readings, profile information, weight entries, and pins — in a local SQLite database on your device. Nothing is uploaded to external servers without your knowledge.',
  // privacyH2/privacyB2 (AI section) retired — session 18
  privacyH3:            'Glucose data',
  privacyB3:            'Live glucose readings are fetched from Abbott\'s LibreLinkUp cloud service using your LibreLinkUp account credentials. They are stored locally for graph history. They are never sent anywhere else.',
  privacyH4:            'Feedback',
  privacyB4:            'If you send feedback via the app, it opens your email client and sends directly to myt1dmate@gmail.com. We do not capture this automatically.',
  privacyH5:            'No ads, no tracking',
  privacyB5:            'My T1D Mate contains no advertising, no analytics SDKs, and no third-party tracking. We don\'t know who you are unless you tell us.',
  privacyH6:            'Contact',
  privacyB6:            'Questions about your data? Email us: myt1dmate@gmail.com',

  // ── LibreLinkUp onboarding ────────────────────────────────────────────────
  llupOnboardingTitle:  'Connect your CGM',
  llupOnboardingSub:    'We use LibreLinkUp to read your glucose',

  llupWhatTitle:        'What is LibreLinkUp?',
  llupWhatBody:         'LibreLinkUp is Abbott\'s official companion app for FreeStyle Libre sensors. When you enable sharing in your LibreLink app, Abbott\'s servers receive your readings in real time.\n\nMy T1D Mate connects directly to those servers using your LibreLinkUp account — no extra hardware or companion apps needed.',

  llupSetupTitle:       'What you\'ll need — about 5 minutes',

  llupStep1Head:        'Install LibreLinkUp & create an account',
  llupStep1Body:        'Download LibreLinkUp from the Play Store. Create a free account using a different email address to your LibreLink account. Check your inbox for a verification email from Abbott and tap Verify Email to complete signup.\n\niPhone user? Search for LibreLinkUp in the App Store.',
  llupStep1Link:        '→ Open LibreLinkUp on Play Store',

  llupStep2Head:        'Enable sharing in your LibreLink app',
  llupStep2Body:        'In your LibreLink app, tap the hamburger menu → Connected Apps → LibreLinkUp → Add Connection, and enter the LibreLinkUp email you just created. You\'ll receive a Sharing invitation email — this just confirms the connection is live, no further action needed.',

  llupStep3Head:        'Confirm your readings are visible',
  llupStep3Body:        'Open the LibreLinkUp app and check your glucose readings are showing. Once confirmed, you can uninstall LibreLinkUp — My T1D Mate takes it from here.',

  llupStep4Head:        'Enter your credentials below',
  llupStep4Body:        'Already done all of this? Tap the button below and enter your LibreLinkUp email and password. That\'s it — you\'re connected. 🎉',

  llupOpenApp:          '🔗  LibreLinkUp on Play Store',
  llupContinueBtn:      'I\'m ready — enter my details →',

  llupFormTitle:        'Your LibreLinkUp details',
  llupFormSub:          'The same email and password you use in the LibreLinkUp app',

  llupEmailLabel:       'Email address',
  llupEmailPlaceholder: 'your@email.com',
  llupPasswordLabel:    'Password',
  llupPasswordPlaceholder: 'Your LibreLinkUp password',
  llupShow:             'Show',
  llupHide:             'Hide',
  llupCredHint:         'Your credentials are stored only on this device and used solely to fetch your glucose readings from Abbott\'s servers.',
  llupConnectBtn:       'Connect →',

  llupChecking:         'Connecting to LibreLinkUp…',

  llupConnectedTitle:   'Connected!',
  llupConnectedBody:    'My T1D Mate can now read your live glucose from LibreLinkUp. Readings update approximately every minute.',

  llupErrorTitle:       'Something went wrong',
  llupErrorEmpty:       'Please enter your email and password.',
  llupErrorCreds:       'Incorrect email or password. Check your LibreLinkUp app credentials and try again.',
  llupErrorTos:         "Your LibreLinkUp account needs to accept Abbott's terms. Open the LibreLinkUp app, accept the terms, then come back and try again.",
  llupErrorNoConn:      "Connected successfully, but no sensor sharing was found. Make sure you've enabled sharing in your LibreLink app and that someone has accepted your LibreLinkUp invitation.",
  llupErrorNetwork:     'Could not reach Abbott\'s servers. Check your internet connection and try again.',
  llupErrorVerify:      'Please verify your myt1dmate@gmail.com email address first. Check your inbox for a verification email from Abbott.',
  llupTryAgain:         'Try again',

  // ── Glucose panel ────────────────────────────────────────────────────────
  glucoseWaiting:       'Waiting for CGM…',
  glucoseWaitingGraph:  'Waiting for readings…',
  glucoseUnit:          'mmol/L',
  glucoseHistory:       'History · ',

};

export const t = (key) => strings[key] ?? key;
export default strings;
