import { createListSliceContext } from './createListSliceContext';
import type { Measurement } from '@/types';

export interface MeasurementsContextValue {
  measurements: Measurement[];
  addMeasurement: (measurement: Measurement) => void;
  updateMeasurement: (id: string, patch: Partial<Measurement>) => void;
  removeMeasurement: (id: string) => void;
  forPatient: (patientId: string) => Measurement[];
}

const { Provider, useSlice } = createListSliceContext<Measurement, MeasurementsContextValue>({
  label: 'Measurements',
  select: (appData) => appData.measurements,
  selectUpdater: (app) => app.updateMeasurementsSlice,
  build: (m, measurements) => ({
    measurements,
    addMeasurement: m.add,
    updateMeasurement: m.update,
    removeMeasurement: m.remove,
    forPatient: (patientId) => measurements.filter((x) => x.patientId === patientId),
  }),
});

export const MeasurementsProvider = Provider;
export const useMeasurements = useSlice;
