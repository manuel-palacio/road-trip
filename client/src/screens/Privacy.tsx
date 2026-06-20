const LAST_UPDATED = '2026-06-21';

export function Privacy() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-paper mb-2">Privacy Policy</h1>
        <p className="text-paper-muted text-sm mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="Who we are">
          <p>
            Road Trip is a personal trip-planning tool built and operated by Emanuel Palacio.
            You can reach us at{' '}
            <a href="mailto:emanuel.palacio@gmail.com" className="underline hover:text-accent">
              emanuel.palacio@gmail.com
            </a>{' '}
            for any questions about this policy or your data.
          </p>
        </Section>

        <Section title="What we collect">
          <Subsection title="Account data">
            <p>
              When you sign in with Google, we receive your email address, display name, and
              profile picture. We store these in Firebase Auth and in Firestore so we can
              identify your account and personalise the interface.
            </p>
          </Subsection>

          <Subsection title="Trip data">
            <p>
              Everything you create inside the app — trips, stops, routes, fuel preferences,
              budget items, favourites, collaborator emails, and any notes or metadata you
              attach to a stop — is stored in Firestore under your account. This data belongs
              to you.
            </p>
          </Subsection>

          <Subsection title="Technical data">
            <p>
              Our server logs the IP address of incoming requests for rate-limiting and abuse
              prevention. We do not build profiles from IP addresses and we do not use
              third-party analytics services.
            </p>
          </Subsection>
        </Section>

        <Section title="Why we collect it">
          <ul className="list-disc pl-5 space-y-1">
            <li>To provide the service — storing and retrieving your trips.</li>
            <li>To authenticate you securely via Firebase Auth.</li>
            <li>To prevent abuse and enforce rate limits.</li>
            <li>To respond to support requests you initiate by email.</li>
          </ul>
        </Section>

        <Section title="Who we share data with">
          <Subsection title="Firebase / Google Cloud">
            <p>
              Trip data and account information are stored in Firestore (Google Cloud,
              region: europe-west1) and Firebase Auth. Google's infrastructure handles
              backups, availability, and security. See{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accent"
              >
                Google's Privacy Policy
              </a>
              .
            </p>
          </Subsection>

          <Subsection title="Google Maps Platform">
            <p>
              When we calculate routes between stops we send waypoint coordinates to the
              Google Maps Routes API and Places API. No personally identifiable information
              is included in these requests.
            </p>
          </Subsection>

          <Subsection title="Affiliate partners (Booking.com, GetYourGuide, Viator)">
            <p>
              The app may surface booking links for hotels and activities through affiliate
              programmes. Clicking one of these links takes you to the partner's website;
              we do not share your personal data with them. They may set their own cookies
              once you land on their site — see their respective privacy policies.
            </p>
          </Subsection>

          <Subsection title="Paddle (payment processor)">
            <p>
              If you upgrade to a paid plan, billing is handled by Paddle. We share only
              the information necessary to process the transaction (email, plan chosen).
              Paddle is our Merchant of Record and handles VAT/tax compliance. See{' '}
              <a
                href="https://www.paddle.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-accent"
              >
                Paddle's Privacy Policy
              </a>
              .
            </p>
          </Subsection>

          <p className="mt-3 text-paper-dim">
            We do not sell your data. We do not share your data with advertisers.
          </p>
        </Section>

        <Section title="Where your data lives">
          <p>
            Your data is stored in Google Cloud Firestore in the <strong>europe-west1</strong>{' '}
            region (Belgium). Firebase Auth data is managed by Google globally.
          </p>
        </Section>

        <Section title="How long we keep your data">
          <p>
            We keep your data for as long as your account is active. If you want your
            account and data deleted, email us at{' '}
            <a href="mailto:emanuel.palacio@gmail.com" className="underline hover:text-accent">
              emanuel.palacio@gmail.com
            </a>{' '}
            and we will delete it within 30 days.
            {/* TODO: Build a self-serve account deletion endpoint so users don't need to email. */}
          </p>
          <p className="mt-2">
            Server request logs (IP addresses) are retained for up to 30 days and then
            purged automatically by Cloud Run.
          </p>
        </Section>

        <Section title="Your rights (GDPR)">
          <p>
            If you are in the EU or UK you have the following rights regarding your personal
            data:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Access</strong> — request a copy of the data we hold about you.
            </li>
            <li>
              <strong>Rectification</strong> — ask us to correct inaccurate data.
            </li>
            <li>
              <strong>Erasure</strong> — ask us to delete your data ("right to be forgotten").
            </li>
            <li>
              <strong>Portability</strong> — receive your trip data in a machine-readable
              format.
            </li>
            <li>
              <strong>Objection</strong> — object to processing based on legitimate interests.
            </li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, email{' '}
            <a href="mailto:emanuel.palacio@gmail.com" className="underline hover:text-accent">
              emanuel.palacio@gmail.com
            </a>
            . We will respond within 30 days.
          </p>
        </Section>

        <Section title="Cookies and local storage">
          <p>We use the following, and nothing else:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Session cookie</strong> — set by Firebase Auth to maintain your
              sign-in session across page loads.
            </li>
            <li>
              <strong>localStorage (theme / layout preferences)</strong> — we save your
              UI preferences (theme, panel layout) in your browser's local storage so they
              persist between visits. This never leaves your device.
            </li>
            <li>
              <strong>localStorage (cookie banner)</strong> — a single flag that remembers
              you have dismissed this notice.
            </li>
          </ul>
          <p className="mt-3">
            We do not use Google Analytics, Facebook Pixel, or any other third-party
            tracking scripts.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Road Trip is not intended for users under 16 years of age. We do not knowingly
            collect data from anyone under 16. If you believe a child has created an account,
            please contact us and we will delete it.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            If we make material changes we will update the date at the top of this page.
            Continued use of the service after a change constitutes acceptance of the
            updated policy.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-paper mb-3 pb-1 border-b border-line">{title}</h2>
      <div className="text-paper-dim text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="text-paper font-medium mb-1">{title}</h3>
      {children}
    </div>
  );
}
