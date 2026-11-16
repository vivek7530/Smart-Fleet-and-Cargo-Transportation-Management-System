import assert from 'node:assert/strict';
import test from 'node:test';
import { createTripSchema, historicalTripSchema, startTripSchema, completeTripSchema } from './trips.validation';
import { odometerCorrectionSchema } from '../../services/odometer.service';

function indiaToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function indiaTomorrow() {
  const tomorrow = new Date(`${indiaToday()}T12:00:00+05:30`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(tomorrow);
}

const trip = (startDate: string, expectedDeliveryDate = startDate) => ({
  pickupLocation: 'Ahmedabad',
  deliveryLocation: 'Mumbai',
  startDate,
  expectedDeliveryDate,
  revenue: 1000,
});

test('planned trip accepts today and future dates', () => {
  assert.equal(createTripSchema.safeParse(trip(indiaToday())).success, true);
  assert.equal(createTripSchema.safeParse(trip(indiaTomorrow())).success, true);
});

test('planned trip rejects past dates and delivery before start', () => {
  assert.equal(createTripSchema.safeParse(trip('2020-01-01')).success, false);
  assert.equal(createTripSchema.safeParse(trip(indiaTomorrow(), indiaToday())).success, false);
});

test('separate historical-entry schema accepts past operations with valid odometer order', () => {
  const result = historicalTripSchema.safeParse({
    pickupLocation: 'Ahmedabad',
    deliveryLocation: 'Mumbai',
    actualStartDate: '2020-01-01',
    actualDeliveryDate: '2020-01-02',
    startOdometerKm: 1000,
    closingOdometerKm: 1500,
    revenue: 1000,
  });
  assert.equal(result.success, true);
  assert.equal(historicalTripSchema.safeParse({
    pickupLocation: 'Ahmedabad',
    deliveryLocation: 'Mumbai',
    actualStartDate: '2020-01-02',
    actualDeliveryDate: '2020-01-01',
    startOdometerKm: 1500,
    closingOdometerKm: 1000,
    revenue: 1000,
  }).success, false);
});

test('start and completion require finite nonnegative odometer readings at 0.1 km precision', () => {
  assert.equal(startTripSchema.safeParse({ odometerKm: 12000.1 }).success, true);
  assert.equal(startTripSchema.safeParse({}).success, false);
  assert.equal(startTripSchema.safeParse({ odometerKm: -1 }).success, false);
  assert.equal(startTripSchema.safeParse({ odometerKm: 12000.12 }).success, false);
  assert.equal(completeTripSchema.safeParse({ odometerKm: 12010.1 }).success, true);
  assert.equal(completeTripSchema.safeParse({}).success, false);
});

test('odometer correction requires a source record, valid reading, and audit reason', () => {
  assert.equal(odometerCorrectionSchema.safeParse({
    source: 'TRUCK', recordId: '0123456789abcdef01234567', readingKm: 2500.5, reason: 'Corrected from signed service record',
  }).success, true);
  assert.equal(odometerCorrectionSchema.safeParse({
    source: 'FUEL', recordId: '0123456789abcdef01234567', readingKm: 2500.5, reason: 'typo',
  }).success, false);
});
