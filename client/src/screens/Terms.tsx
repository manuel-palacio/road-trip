const LAST_UPDATED = '2026-06-21';

export function Terms() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-paper mb-2">Terms of Service</h1>
        <p className="text-paper-muted text-sm mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="Acceptance">
          <p>
            By accessing or using Road Trip you agree to be bound by these Terms of Service.
            If you do not agree, do not use the service. These terms form a legally binding
            agreement between you and Emanuel Palacio, the operator of Road Trip.
          </p>
        </Section>

        <Section title="Account">
          <ul className="list-disc pl-5 space-y-1">
            <li>You must be at least 16 years old to create an account.</li>
            <li>One account per person. Do not share your credentials.</li>
            <li>
              You are responsible for all activity that occurs under your account. Notify
              us immediately if you suspect unauthorised access.
            </li>
            <li>
              We use Google Sign-In for authentication. By signing in you also agree to
              Google's terms.
            </li>
          </ul>
        </Section>

        <Section title="Plans and billing">
          <p>
            Road Trip offers a <strong>Free</strong> plan and a <strong>Pro</strong> plan.
            The Free plan includes a limited number of trips. The Pro plan removes these
            limits; pricing is shown on the upgrade page.
          </p>
          <p className="mt-2">
            Billing for the Pro plan is handled by Paddle, our Merchant of Record. All
            subscription management (upgrades, downgrades, cancellations) is done through
            Paddle's customer portal.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Use the service for any illegal purpose.</li>
            <li>
              Scrape, crawl, or systematically extract data from the service without prior
              written permission.
            </li>
            <li>
              Attempt to reverse-engineer, decompile, or otherwise derive source code from
              the service.
            </li>
            <li>Resell or sublicense access to the service.</li>
            <li>Use the service to send spam or harass other users.</li>
            <li>
              Circumvent rate limits, authentication, or other technical controls.
            </li>
            <li>
              Upload or transmit malicious code, viruses, or any content intended to
              disrupt or damage the service.
            </li>
          </ul>
          <p className="mt-3">
            We reserve the right to determine what constitutes a violation of these rules
            at our sole discretion.
          </p>
        </Section>

        <Section title="Content ownership">
          <p>
            You retain ownership of the trip data, notes, and other content you create in
            Road Trip (<strong>"Your Content"</strong>). By using the service you grant us
            a limited, non-exclusive, royalty-free licence to store, process, and display
            Your Content solely for the purpose of providing the service to you.
          </p>
          <p className="mt-2">
            We do not use Your Content for advertising, training AI models, or any purpose
            other than operating and improving Road Trip.
          </p>
        </Section>

        <Section title="Templates marketplace">
          <p>
            If you publish a trip as a public template in the templates marketplace, you
            grant other users of Road Trip a non-exclusive licence to clone (copy and
            modify) that template for their own personal use. You can unpublish a template
            at any time, but copies already cloned by other users are not affected.
          </p>
          <p className="mt-2">
            Do not publish templates that contain personal information belonging to others
            or content that infringes third-party rights.
          </p>
        </Section>

        <Section title="Termination">
          <p>
            We may suspend or terminate your account at any time if we determine, at our
            sole discretion, that you have violated these Terms or are otherwise misusing
            the service. On termination your data will be deleted within 30 days. You may
            also request account deletion at any time by emailing{' '}
            <a href="mailto:emanuel.palacio@gmail.com" className="underline hover:text-accent">
              emanuel.palacio@gmail.com
            </a>
            .
          </p>
        </Section>

        <Section title="No warranty">
          <p>
            The service is provided <strong>"as is"</strong> and{' '}
            <strong>"as available"</strong> without warranties of any kind, express or
            implied, including but not limited to warranties of merchantability, fitness
            for a particular purpose, or non-infringement. We do not warrant that the
            service will be uninterrupted, error-free, or that data will never be lost.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by applicable law, our total liability to you
            for any claim arising out of or relating to these Terms or the service is
            limited to the amount you have paid us in the 12 months preceding the claim.
            For Free plan users this means our liability is limited to <strong>€0</strong>.
          </p>
          <p className="mt-2">
            We are not liable for indirect, incidental, special, consequential, or punitive
            damages, including loss of profits, data, goodwill, or other intangible losses.
          </p>
        </Section>

        <Section title="Governing law and jurisdiction">
          <p>
            These Terms are governed by the laws of <strong>Sweden</strong>. Any dispute
            arising out of or in connection with these Terms shall be subject to the
            exclusive jurisdiction of the{' '}
            <strong>Stockholm District Court (Stockholms tingsrätt)</strong>.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these Terms from time to time. The date at the top of this page
            reflects the most recent revision. Material changes will be communicated by
            updating the date and, where practical, by email. Continued use of the service
            after a change constitutes acceptance of the updated Terms.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about these Terms?{' '}
            <a href="mailto:emanuel.palacio@gmail.com" className="underline hover:text-accent">
              emanuel.palacio@gmail.com
            </a>
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
