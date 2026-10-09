import sharp from 'sharp';
import { Role } from '../src/modules/access-control/access-control.catalog.js';
import {
  makeAdmin,
  bearer,
  createTestApp,
  login,
  type LoggedIn,
  type TestContext,
} from './helpers/test-app.js';

// Near Hubballi city centre (15.3647, 75.1240); Bengaluru is far outside the service radius.
const HUBBALLI_PIN = { latitude: 15.3602, longitude: 75.1301 };
const BENGALURU_PIN = { latitude: 12.9716, longitude: 77.5946 };

const jpeg = (width = 800, height = 600) =>
  sharp({ create: { width, height, channels: 3, background: '#cc6633' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'shop owner', Copyright: 'private' } })
    .toBuffer();

describe('Businesses: registration → verification → public profile (real Postgres/PostGIS + Valkey)', () => {
  let ctx: TestContext;
  let admin: LoggedIn;
  let superAdmin: LoggedIn;
  let owner: LoggedIn;
  let stranger: LoggedIn;
  let hubballiId: string;
  let dharwadId: string;
  let fashionId: string;

  /** Admin role plus 2-step login, as every admin needs (ADR-0018). */
  const grant = (user: LoggedIn, role: Role) => makeAdmin(ctx, user, role);

  /** Reads a binary response body (images) as a Buffer. */
  const getBinary = (path: string, headers: Record<string, string> = {}) =>
    ctx
      .http()
      .get(path)
      .set(headers)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const register = (who: LoggedIn, overrides: Record<string, unknown> = {}) =>
    ctx
      .http()
      .post('/api/v1/me/businesses')
      .set(bearer(who.accessToken))
      .send({
        name: 'Sri Ganesh Textiles',
        categoryId: fashionId,
        phone: '0836 225 5123',
        whatsapp: '9845012345',
        description: 'Sarees, dress materials and menswear since 1995.',
        location: {
          addressLine1: 'Shop 12, Laxmi Complex, Station Road',
          cityId: hubballiId,
          ...HUBBALLI_PIN,
        },
        ...overrides,
      });

  const upload = async (who: LoggedIn, businessId: string, kind: string, body?: Buffer) =>
    ctx
      .http()
      .post(`/api/v1/me/businesses/${businessId}/images`)
      .query({ kind })
      .set(bearer(who.accessToken))
      .attach('file', body ?? (await jpeg()), 'photo.jpg');

  const setStatus = (who: LoggedIn, id: string, action: string, reason?: string) =>
    ctx
      .http()
      .patch(`/api/v1/admin/businesses/${id}/status`)
      .set(bearer(who.accessToken))
      .send(reason ? { action, reason } : { action });

  beforeAll(async () => {
    ctx = await createTestApp();
    [admin, superAdmin, owner, stranger] = [
      await login(ctx),
      await login(ctx),
      await login(ctx),
      await login(ctx),
    ];
    await grant(admin, Role.ADMIN);
    await grant(superAdmin, Role.SUPER_ADMIN);

    const cities = await ctx.http().get('/api/v1/cities').expect(200);
    hubballiId = cities.body.data.find((c: { slug: string }) => c.slug === 'hubballi').id;
    dharwadId = cities.body.data.find((c: { slug: string }) => c.slug === 'dharwad').id;
    const categories = await ctx.http().get('/api/v1/categories').expect(200);
    const shopping = categories.body.data.find((c: { slug: string }) => c.slug === 'shopping');
    fashionId = shopping.children.find((c: { slug: string }) => c.slug === 'fashion').id;
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('reference data', () => {
    it('serves the launch cities and the seeded category tree publicly', async () => {
      const cities = await ctx.http().get('/api/v1/cities').expect(200);
      expect(cities.body.data.map((c: { name: string }) => c.name)).toEqual(['Dharwad', 'Hubballi']);
      const categories = await ctx.http().get('/api/v1/categories').expect(200);
      expect(categories.body.data.map((c: { slug: string }) => c.slug)).toEqual([
        'shopping',
        'food',
        'services',
        'experiences',
      ]);
      expect(categories.body.data[0].children).toHaveLength(7);
    });
  });

  describe('registration', () => {
    it('creates a PENDING business, normalises phones, grants BUSINESS_OWNER', async () => {
      const res = await register(owner).expect(201);
      expect(res.body.data).toMatchObject({
        name: 'Sri Ganesh Textiles',
        status: 'PENDING',
        isVerified: false,
        contact: { phone: '+918362255123', whatsapp: '+919845012345' },
        address: { city: { slug: 'hubballi' }, line1: 'Shop 12, Laxmi Complex, Station Road' },
        coordinates: HUBBALLI_PIN,
        lockedFields: [],
        verification: { complete: false },
      });
      expect(res.body.data.slug).toMatch(/^sri-ganesh-textiles-hubballi/);

      const me = await ctx.http().get('/api/v1/users/me').set(bearer(owner.accessToken)).expect(200);
      expect(me.body.data.roles).toContain('BUSINESS_OWNER');
    });

    it('gives a second business with the same name a different slug', async () => {
      const other = await login(ctx);
      const a = await register(other).expect(201);
      const b = await register(other).expect(201);
      expect(a.body.data.slug).not.toBe(b.body.data.slug);
    });

    it('rejects a map pin outside the city service area', async () => {
      const res = await register(owner, {
        location: { addressLine1: 'MG Road', cityId: hubballiId, ...BENGALURU_PIN },
      }).expect(400);
      expect(res.body.error.fields).toHaveProperty(['location.latitude']);
    });

    it('rejects an unknown category and an invalid WhatsApp number with field errors', async () => {
      const badCategory = await register(owner, {
        categoryId: '01a0f1de-0000-7000-8000-00000000abcd',
      }).expect(400);
      expect(badCategory.body.error.fields).toHaveProperty('categoryId');
      const badWhatsapp = await register(owner, { whatsapp: '12345' }).expect(400);
      expect(badWhatsapp.body.error.fields).toEqual({ whatsapp: 'Invalid phone number' });
    });

    it('rejects a locality that belongs to another city', async () => {
      const locality = await ctx
        .http()
        .post(`/api/v1/admin/cities/${dharwadId}/localities`)
        .set(bearer(admin.accessToken))
        .send({ name: 'Saptapur' })
        .expect(201);
      const res = await register(owner, {
        location: {
          addressLine1: 'Shop 3',
          cityId: hubballiId,
          localityId: locality.body.data.id,
          ...HUBBALLI_PIN,
        },
      }).expect(400);
      expect(res.body.error.fields).toHaveProperty(['location.localityId']);
    });
  });

  describe('privacy and ownership', () => {
    let businessId: string;
    let slug: string;
    beforeAll(async () => {
      const res = await register(owner, { name: 'Private Check Stores' }).expect(201);
      businessId = res.body.data.id;
      slug = res.body.data.slug;
    });

    it('an unverified business is invisible to the public', async () => {
      await ctx.http().get(`/api/v1/businesses/${slug}`).expect(404);
      const list = await ctx.http().get('/api/v1/businesses').expect(200);
      expect(list.body.data.map((b: { id: string }) => b.id)).not.toContain(businessId);
    });

    it("another user gets 404 for someone else's business (not even 403)", async () => {
      await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(stranger.accessToken))
        .expect(404);
      await ctx
        .http()
        .patch(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(stranger.accessToken))
        .send({ description: 'hijacked' })
        .expect(404);
      const up = await upload(stranger, businessId, 'GALLERY');
      expect(up.status).toBe(404);
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/submit`)
        .set(bearer(stranger.accessToken))
        .expect(404);
    });

    it('customers cannot reach the admin business endpoints', async () => {
      await ctx.http().get('/api/v1/admin/businesses').set(bearer(stranger.accessToken)).expect(403);
      await setStatus(stranger, businessId, 'VERIFY').expect(403);
    });
  });

  describe('images', () => {
    let businessId: string;
    beforeAll(async () => {
      businessId = (await register(owner, { name: 'Image Test Traders' }).expect(201)).body.data.id;
    });

    it('rejects a file that is not really an image, whatever its name', async () => {
      const res = await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/images`)
        .query({ kind: 'GALLERY' })
        .set(bearer(owner.accessToken))
        .attach('file', Buffer.from('<?php echo "pwned"; ?>'), 'photo.jpg')
        .expect(400);
      expect(res.body.error.fields).toHaveProperty('file');
    });

    it('rejects a missing file and an unknown kind', async () => {
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/images`)
        .query({ kind: 'GALLERY' })
        .set(bearer(owner.accessToken))
        .expect(400);
      await upload(owner, businessId, 'PASSPORT').then((r) => expect(r.status).toBe(400));
    });

    it('rejects files over the size limit with 413', async () => {
      const huge = Buffer.alloc(9 * 1024 * 1024, 1);
      const res = await upload(owner, businessId, 'GALLERY', huge);
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('stores a verification photo as WebP with all metadata stripped, private to owner and admins', async () => {
      const res = await upload(owner, businessId, 'VERIFICATION_SHOP');
      expect(res.status).toBe(201);
      const image = res.body.data;
      expect(image).toMatchObject({ kind: 'VERIFICATION_SHOP', width: 800, height: 600 });

      const own = await getBinary(image.urls.full, bearer(owner.accessToken)).expect(200);
      expect(own.headers['content-type']).toBe('image/webp');
      expect(own.headers['cache-control']).toBe('private, no-store');
      // Private photos must never be embeddable by other sites.
      expect(own.headers['cross-origin-resource-policy']).toBe('same-origin');
      const meta = await sharp(own.body as Buffer).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();

      await getBinary(`/api/v1/media/images/${image.id}/full`).expect(404);
      await getBinary(image.urls.full, bearer(stranger.accessToken)).expect(404);
      await getBinary(
        `/api/v1/admin/businesses/${businessId}/images/${image.id}/thumb`,
        bearer(admin.accessToken),
      ).expect(200);
      await getBinary(
        `/api/v1/admin/businesses/${businessId}/images/${image.id}/thumb`,
        bearer(stranger.accessToken),
      ).expect(403);
    });

    it('replaces the single logo instead of adding a second one', async () => {
      await upload(owner, businessId, 'LOGO').then((r) => expect(r.status).toBe(201));
      await upload(owner, businessId, 'LOGO').then((r) => expect(r.status).toBe(201));
      const view = await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(view.body.data.logo).not.toBeNull();
      const dashboard = await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}/dashboard`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(dashboard.body.data.profile.hasLogo).toBe(true);
    });

    it('deletes an image', async () => {
      const up = await upload(owner, businessId, 'GALLERY');
      await ctx
        .http()
        .delete(`/api/v1/me/businesses/${businessId}/images/${up.body.data.id}`)
        .set(bearer(owner.accessToken))
        .expect(204);
      await getBinary(up.body.data.urls.full, bearer(owner.accessToken)).expect(404);
    });
  });

  describe('verification workflow', () => {
    let businessId: string;
    let slug: string;

    beforeAll(async () => {
      const res = await register(owner, {
        name: 'Mahalaxmi Silks',
        registrationNumber: 'KA-HUB-12345',
      }).expect(201);
      businessId = res.body.data.id;
      slug = res.body.data.slug;
    });

    it('cannot submit before the checklist is complete', async () => {
      const res = await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/submit`)
        .set(bearer(owner.accessToken))
        .expect(400);
      expect(res.body.error.fields).toHaveProperty('shopPhoto');
    });

    it('submits once the shop photo is uploaded; locked fields then refuse owner edits', async () => {
      await upload(owner, businessId, 'VERIFICATION_SHOP').then((r) => expect(r.status).toBe(201));
      const dashboard = await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}/dashboard`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(dashboard.body.data.canSubmit).toBe(true);

      const submitted = await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/submit`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(submitted.body.data).toMatchObject({
        status: 'UNDER_REVIEW',
        lockedFields: expect.arrayContaining(['name']),
      });

      const locked = await ctx
        .http()
        .patch(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(owner.accessToken))
        .send({ name: 'Renamed While In Review' })
        .expect(409);
      expect(locked.body.error).toMatchObject({ code: 'FIELDS_LOCKED', fields: { name: 'Locked' } });

      await ctx
        .http()
        .patch(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(owner.accessToken))
        .send({ description: 'Now with bridal collection' })
        .expect(200);
      expect((await upload(owner, businessId, 'VERIFICATION_SHOP')).status).toBe(409);
    });

    it('appears in the admin review queue, oldest first', async () => {
      const queue = await ctx
        .http()
        .get('/api/v1/admin/businesses')
        .query({ status: 'UNDER_REVIEW' })
        .set(bearer(admin.accessToken))
        .expect(200);
      const item = queue.body.data.find((b: { id: string }) => b.id === businessId);
      expect(item).toMatchObject({
        status: 'UNDER_REVIEW',
        registrationNumber: 'KA-HUB-12345',
        ownerUserId: owner.userId,
      });
      expect(item.verificationPhotos.shop[0].urls.full).toContain('/admin/businesses/');
    });

    it('reject requires a reason; the owner sees it, fixes and resubmits', async () => {
      await setStatus(admin, businessId, 'REJECT').expect(400);
      const rejected = await setStatus(
        admin,
        businessId,
        'REJECT',
        'Shop photo is blurry, please retake',
      ).expect(200);
      expect(rejected.body.data).toMatchObject({
        status: 'REJECTED',
        statusReason: 'Shop photo is blurry, please retake',
      });

      const ownView = await ctx
        .http()
        .get(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(owner.accessToken))
        .expect(200);
      expect(ownView.body.data.statusReason).toBe('Shop photo is blurry, please retake');
      expect(ownView.body.data.lockedFields).toEqual([]);

      const photos = ownView.body.data.verificationPhotos.shop;
      await ctx
        .http()
        .delete(`/api/v1/me/businesses/${businessId}/images/${photos[0].id}`)
        .set(bearer(owner.accessToken))
        .expect(204);
      await upload(owner, businessId, 'VERIFICATION_SHOP').then((r) => expect(r.status).toBe(201));
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${businessId}/submit`)
        .set(bearer(owner.accessToken))
        .expect(200);
    });

    it('invalid transitions are refused', async () => {
      const res = await setStatus(admin, businessId, 'REACTIVATE').expect(409);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('verify makes it public with the badge, without exposing private data', async () => {
      const verified = await setStatus(admin, businessId, 'VERIFY').expect(200);
      expect(verified.body.data).toMatchObject({
        status: 'VERIFIED',
        isVerified: true,
        verifiedBy: admin.userId,
      });

      await upload(owner, businessId, 'GALLERY').then((r) => expect(r.status).toBe(201));
      const pub = await ctx.http().get(`/api/v1/businesses/${slug}`).expect(200);
      expect(pub.body.data).toMatchObject({
        name: 'Mahalaxmi Silks',
        isVerified: true,
        category: { slug: 'fashion' },
      });
      expect(pub.body.data).not.toHaveProperty('registrationNumber');
      expect(pub.body.data).not.toHaveProperty('verificationPhotos');
      expect(pub.body.data).not.toHaveProperty('status');
      expect(JSON.stringify(pub.body.data)).not.toContain('VERIFICATION_');

      const galleryUrl: string = pub.body.data.gallery[0].urls.thumb;
      expect(galleryUrl).toMatch(/^\/api\/v1\/media\/images\//);
      const img = await getBinary(galleryUrl).expect(200);
      expect(img.headers['cache-control']).toBe('public, max-age=86400');
    });

    it('is listed publicly and filterable by city and parent category', async () => {
      const list = await ctx
        .http()
        .get('/api/v1/businesses')
        .query({ city: 'hubballi', category: 'shopping' })
        .expect(200);
      expect(list.body.data.map((b: { id: string }) => b.id)).toContain(businessId);
      const food = await ctx.http().get('/api/v1/businesses').query({ category: 'food' }).expect(200);
      expect(food.body.data.map((b: { id: string }) => b.id)).not.toContain(businessId);
      await ctx.http().get('/api/v1/businesses').query({ city: 'mumbai' }).expect(404);
    });

    it('suspension hides it and blocks owner edits; reactivation restores VERIFIED', async () => {
      await setStatus(admin, businessId, 'SUSPEND').expect(400);
      await setStatus(admin, businessId, 'SUSPEND', 'Reported for fake discounts').expect(200);
      await ctx.http().get(`/api/v1/businesses/${slug}`).expect(404);
      await ctx
        .http()
        .patch(`/api/v1/me/businesses/${businessId}`)
        .set(bearer(owner.accessToken))
        .send({ description: 'x' })
        .expect(403);

      const back = await setStatus(admin, businessId, 'REACTIVATE').expect(200);
      expect(back.body.data.status).toBe('VERIFIED');
      await ctx.http().get(`/api/v1/businesses/${slug}`).expect(200);
    });

    it('admin can change locked details; the public URL stays stable; everything is audited', async () => {
      const edited = await ctx
        .http()
        .patch(`/api/v1/admin/businesses/${businessId}`)
        .set(bearer(admin.accessToken))
        .send({ name: 'Mahalaxmi Silks & Sarees' })
        .expect(200);
      expect(edited.body.data).toMatchObject({ name: 'Mahalaxmi Silks & Sarees', slug });

      const audit = await ctx
        .http()
        .get('/api/v1/admin/audit-logs')
        .query({ entityId: businessId, pageSize: 50 })
        .set(bearer(admin.accessToken))
        .expect(200);
      expect(audit.body.data.map((a: { action: string }) => a.action).reverse()).toEqual([
        'BUSINESS_REGISTERED',
        'BUSINESS_SUBMITTED_FOR_VERIFICATION',
        'BUSINESS_REJECTED',
        'BUSINESS_SUBMITTED_FOR_VERIFICATION',
        'BUSINESS_VERIFIED',
        'BUSINESS_SUSPENDED',
        'BUSINESS_REACTIVATED',
        'BUSINESS_UPDATED_BY_ADMIN',
      ]);
      expect(audit.body.data[0]).toMatchObject({
        oldValue: { name: 'Mahalaxmi Silks' },
        newValue: { name: 'Mahalaxmi Silks & Sarees' },
      });
    });

    it('an admin cannot verify a business they own', async () => {
      const own = await register(admin, { name: 'Admin Own Shop' }).expect(201);
      await upload(admin, own.body.data.id, 'VERIFICATION_SHOP');
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${own.body.data.id}/submit`)
        .set(bearer(admin.accessToken))
        .expect(200);
      const res = await setStatus(admin, own.body.data.id, 'VERIFY').expect(403);
      expect(res.body.error.message).toContain('own');
    });
  });

  describe('limits', () => {
    it('an owner can register at most 5 businesses', async () => {
      const busy = await login(ctx);
      for (let i = 1; i <= 5; i++) await register(busy, { name: `Chain Store ${i}` }).expect(201);
      const sixth = await register(busy, { name: 'Chain Store 6' }).expect(409);
      expect(sixth.body.error.message).toContain('up to 5');
    });
  });

  describe('admin configuration', () => {
    let shopOwner: LoggedIn;
    beforeAll(async () => {
      shopOwner = await login(ctx);
    });

    it('only a SUPER_ADMIN can change verification requirements, and new rules apply immediately', async () => {
      const put = (who: LoggedIn, value: object) =>
        ctx
          .http()
          .put('/api/v1/admin/settings/business.verification')
          .set(bearer(who.accessToken))
          .send({ value });
      const strict = { requireRegistrationNumber: true, requireShopPhoto: true, requireOwnerPhoto: true };

      await put(admin, strict).expect(403);
      await put(superAdmin, { requireShopPhoto: 'yes' }).expect(400);
      await put(superAdmin, strict).expect(200);

      const biz = await register(shopOwner, { name: 'Strict Rules Mart' }).expect(201);
      const keys = biz.body.data.verification.items
        .filter((i: { required: boolean }) => i.required)
        .map((i: { key: string }) => i.key);
      expect(keys.sort()).toEqual(['ownerPhoto', 'registrationNumber', 'shopPhoto']);

      await put(superAdmin, {
        requireRegistrationNumber: false,
        requireShopPhoto: true,
        requireOwnerPhoto: false,
      }).expect(200);
    });

    it('manages categories: two levels only, disabling a parent hides its branch and blocks new use', async () => {
      const parent = await ctx
        .http()
        .post('/api/v1/admin/categories')
        .set(bearer(admin.accessToken))
        .send({ name: 'Wellness' })
        .expect(201);
      const child = await ctx
        .http()
        .post('/api/v1/admin/categories')
        .set(bearer(admin.accessToken))
        .send({ name: 'Spas', parentId: parent.body.data.id })
        .expect(201);
      await ctx
        .http()
        .post('/api/v1/admin/categories')
        .set(bearer(admin.accessToken))
        .send({ name: 'Too Deep', parentId: child.body.data.id })
        .expect(400);

      await ctx
        .http()
        .patch(`/api/v1/admin/categories/${parent.body.data.id}`)
        .set(bearer(admin.accessToken))
        .send({ isActive: false })
        .expect(200);
      const tree = await ctx.http().get('/api/v1/categories').expect(200);
      expect(tree.body.data.map((c: { slug: string }) => c.slug)).not.toContain('wellness');
      await register(shopOwner, { name: 'Calm Spa', categoryId: child.body.data.id }).expect(400);
      await ctx
        .http()
        .post('/api/v1/admin/categories')
        .set(bearer(stranger.accessToken))
        .send({ name: 'X Y' })
        .expect(403);
    });

    it('reorders top-level categories', async () => {
      const tree = await ctx
        .http()
        .get('/api/v1/admin/categories')
        .set(bearer(admin.accessToken))
        .expect(200);
      const ids: string[] = tree.body.data.map((c: { id: string }) => c.id);
      const reversed = [...ids].reverse();
      const res = await ctx
        .http()
        .put('/api/v1/admin/categories/order')
        .set(bearer(admin.accessToken))
        .send({ parentId: null, orderedIds: reversed })
        .expect(200);
      expect(res.body.data.map((c: { id: string }) => c.id)).toEqual(reversed);
      await ctx
        .http()
        .put('/api/v1/admin/categories/order')
        .set(bearer(admin.accessToken))
        .send({ parentId: null, orderedIds: reversed.slice(1) })
        .expect(400);
      await ctx
        .http()
        .put('/api/v1/admin/categories/order')
        .set(bearer(admin.accessToken))
        .send({ parentId: null, orderedIds: ids })
        .expect(200);
    });

    it('localities power the "<category> in <locality>" filter', async () => {
      const vidyanagar = await ctx
        .http()
        .post(`/api/v1/admin/cities/${hubballiId}/localities`)
        .set(bearer(admin.accessToken))
        .send({ name: 'Vidya Nagar' })
        .expect(201);
      expect(vidyanagar.body.data.slug).toBe('vidya-nagar');
      const pub = await ctx.http().get('/api/v1/cities/hubballi/localities').expect(200);
      expect(pub.body.data.map((l: { slug: string }) => l.slug)).toContain('vidya-nagar');

      const biz = await register(shopOwner, {
        name: 'Vidya Nagar Footwear',
        location: {
          addressLine1: 'Shop 4, PB Road',
          cityId: hubballiId,
          localityId: vidyanagar.body.data.id,
          ...HUBBALLI_PIN,
        },
      }).expect(201);
      await upload(shopOwner, biz.body.data.id, 'VERIFICATION_SHOP');
      await ctx
        .http()
        .post(`/api/v1/me/businesses/${biz.body.data.id}/submit`)
        .set(bearer(shopOwner.accessToken))
        .expect(200);
      await setStatus(admin, biz.body.data.id, 'VERIFY').expect(200);

      const filtered = await ctx
        .http()
        .get('/api/v1/businesses')
        .query({ city: 'hubballi', locality: 'vidya-nagar', category: 'fashion' })
        .expect(200);
      expect(filtered.body.data.map((b: { name: string }) => b.name)).toEqual(['Vidya Nagar Footwear']);
    });
  });
});
