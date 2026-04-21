import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Interactive Vault Hygiene',
    description: (
      <>
        Detects duplicates, weak passwords, reused credentials, missing fields,
        and disorganized folders — then walks you through each finding one at a time.
      </>
    ),
  },
  {
    title: 'Zero Trust by Design',
    description: (
      <>
        Plaintext never leaves memory. No network calls, no telemetry, no secrets on disk.
        Every mutation requires your explicit per-item approval.
      </>
    ),
  },
  {
    title: 'Works With Your Vault',
    description: (
      <>
        Operates through the official Bitwarden CLI. No API keys, no master password
        handling. Interrupt anytime and resume later — progress is never lost.
      </>
    ),
  },
];

function Feature({title, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
