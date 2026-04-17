import { describe, it, expect } from 'vitest';
import {
  getCountry,
  getEntity,
  getChildren,
  getAllAtLevel,
  createBranch,
} from '../entities';

describe('entities service', () => {
  describe('getCountry()', () => {
    it('returns country data with an id and name', async () => {
      const country = await getCountry();
      expect(country).toBeDefined();
      expect(country.id).toBe('ug');
      expect(country.name).toBe('Uganda');
    });

    it('returns country data with metrics', async () => {
      const country = await getCountry();
      expect(country.metrics).toBeDefined();
      expect(country.metrics).not.toBeNull();
    });

    it('returns country data with a center coordinate', async () => {
      const country = await getCountry();
      expect(country.center).toBeDefined();
      expect(country.center).toHaveLength(2);
    });
  });

  describe('getEntity()', () => {
    it('returns a region entity by level and id', async () => {
      const region = await getEntity('region', 'r-central');
      expect(region).toBeDefined();
      expect(region.id).toBe('r-central');
      expect(region.name).toBe('Central');
    });

    it('returns a district entity by level and id', async () => {
      const district = await getEntity('district', 'd-kampala');
      expect(district).toBeDefined();
      expect(district.id).toBe('d-kampala');
      expect(district.name).toBe('Kampala');
    });

    it('returns null for a non-existent entity', async () => {
      const result = await getEntity('region', 'r-nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getChildren()', () => {
    it('returns child regions for the country', async () => {
      const regions = await getChildren('country', 'ug');
      expect(regions).toBeDefined();
      expect(Array.isArray(regions)).toBe(true);
      expect(regions.length).toBe(4);
      regions.forEach((r) => {
        expect(r.parentId).toBe('ug');
      });
    });

    it('returns child districts for a region', async () => {
      const districts = await getChildren('region', 'r-central');
      expect(districts).toBeDefined();
      expect(Array.isArray(districts)).toBe(true);
      expect(districts.length).toBeGreaterThan(0);
      districts.forEach((d) => {
        expect(d.parentId).toBe('r-central');
      });
    });

    it('returns an empty array for a level with no children', async () => {
      const result = await getChildren('subscriber', 'sub-1');
      expect(result).toEqual([]);
    });
  });

  describe('getAllAtLevel()', () => {
    it('returns 4 regions', async () => {
      const regions = await getAllAtLevel('region');
      expect(regions).toHaveLength(4);
    });

    it('returns 136 districts', async () => {
      const districts = await getAllAtLevel('district');
      expect(districts).toHaveLength(136);
    });

    it('returns branches as an array with length > 0', async () => {
      const branches = await getAllAtLevel('branch');
      expect(Array.isArray(branches)).toBe(true);
      expect(branches.length).toBeGreaterThan(0);
    });

    it('returns agents as an array with length > 0', async () => {
      const agents = await getAllAtLevel('agent');
      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('returns an empty array for an invalid level', async () => {
      const result = await getAllAtLevel('nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('createBranch()', () => {
    it('returns a new branch object with the provided data', async () => {
      const data = {
        name: 'Test Branch',
        districtId: 'd-kampala',
        cityTown: 'Kampala',
        address: '123 Test St',
        adminName: 'John Doe',
        adminPhone: '770000000',
      };
      const branch = await createBranch(data);
      expect(branch).toBeDefined();
      expect(branch.id).toMatch(/^b-new-/);
      expect(branch.name).toBe('Test Branch');
      expect(branch.districtId).toBe('d-kampala');
      expect(branch.status).toBe('active');
      expect(branch.metrics).toBeNull();
    });

    it('includes optional fields when provided', async () => {
      const data = {
        name: 'Another Branch',
        districtId: 'd-jinja',
        cityTown: 'Jinja',
        address: '456 Main Rd',
        landmark: 'Near the bridge',
        poBox: 'P.O. Box 100',
        adminName: 'Jane Doe',
        adminPhone: '780000000',
        adminEmail: 'jane@example.com',
      };
      const branch = await createBranch(data);
      expect(branch.landmark).toBe('Near the bridge');
      expect(branch.poBox).toBe('P.O. Box 100');
      expect(branch.adminEmail).toBe('jane@example.com');
    });
  });
});
