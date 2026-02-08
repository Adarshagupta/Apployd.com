import Stripe from 'stripe';

import { env } from '../config/env.js';

export const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

export const mapPlanPrice = (planCode: string): number => {
  switch (planCode) {
    case 'free':
      return 0;
    case 'dev':
      return 500;
    case 'pro':
      return 1200;
    case 'max':
      return 2500;
    default:
      return 10000;
  }
};
