import { FaqItem } from './faq-item';
import { ScrollReveal } from '@/components/landing/scroll-reveal';

export interface FAQItem {
  question: string;
  answer: React.ReactNode;
  /** Plain-text representation for JSON-LD structured data (SEO). */
  plainTextAnswer: string;
}

interface UseCaseFAQProps {
  items: FAQItem[];
}

export function UseCaseFAQ({ items }: UseCaseFAQProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.plainTextAnswer,
      },
    })),
  };

  return (
    <section className="relative z-10 w-full py-6 md:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="flex justify-center">
        <div className="w-full max-w-4xl px-4">
          <ScrollReveal>
            <h2 className="mb-4 font-medium text-foreground text-xl">
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {items.map((item, index) => (
                <FaqItem
                  key={index}
                  index={index}
                  question={item.question}
                  answer={item.answer}
                />
              ))}
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
