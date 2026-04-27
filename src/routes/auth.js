import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config, hasAuthConfig, hasTraccarConfig } from '../config.js';
import { UserModel } from '../models/User.js';

const router = express.Router();

const getTraccarAdminAuthHeader = () =>
  `Basic ${Buffer.from(`${config.traccar.username}:${config.traccar.password}`).toString('base64')}`;

const sanitizeUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  provider: 'local',
});

const createToken = (payload) => {
  if (!hasAuthConfig) {
    throw new Error('Auth config missing. Set AUTH_JWT_SECRET in backend .env');
  }
  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, error: 'Missing authorization token' });
  }

  try {
    const payload = jwt.verify(token, config.auth.jwtSecret);
    req.auth = payload;
    return next();
  } catch (_error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'name, email and password are required' });
    }

    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ name, email, passwordHash });
    const safeUser = sanitizeUser(user);
    const token = createToken({ sub: safeUser.id, provider: 'local' });
    return res.status(201).json({ success: true, token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Signup failed' });
  }
});

router.post('/signin', async (req, res) => {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const safeUser = sanitizeUser(user);
    const token = createToken({ sub: safeUser.id, provider: 'local' });
    return res.status(200).json({ success: true, token, user: safeUser });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Signin failed' });
  }
});

router.post('/traccar-signin', async (req, res) => {
  try {
    if (!hasTraccarConfig) {
      return res
        .status(500)
        .json({ success: false, error: 'Traccar config missing in backend environment' });
    }

    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'email and password are required' });
    }

    const payload = new URLSearchParams({ email, password });
    const response = await fetch(`${config.traccar.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Traccar signin failed',
      });
    }

    const data = await response.json();
    const traccarUser = {
      id: String(data?.id || ''),
      name: data?.name || data?.email || email,
      email: data?.email || email,
      provider: 'traccar',
    };
    const token = createToken({
      sub: traccarUser.id || traccarUser.email,
      provider: 'traccar',
      traccarEmail: traccarUser.email,
    });
    return res.status(200).json({ success: true, token, user: traccarUser });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: error?.message || 'Traccar signin failed' });
  }
});

router.post('/traccar-signup', async (req, res) => {
  try {
    if (!hasTraccarConfig) {
      return res
        .status(500)
        .json({ success: false, error: 'Traccar config missing in backend environment' });
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ success: false, error: 'name, email and password are required' });
    }

    const createResponse = await fetch(`${config.traccar.baseUrl}/users`, {
      method: 'POST',
      headers: {
        Authorization: getTraccarAdminAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name,
        email,
        password,
      }),
    });

    if (!createResponse.ok) {
      const responseText = await createResponse.text().catch(() => '');
      return res.status(createResponse.status).json({
        success: false,
        error: responseText || 'Traccar user creation failed',
      });
    }

    // Reuse signin endpoint style so frontend can immediately continue with Traccar mode.
    const payload = new URLSearchParams({ email, password });
    const sessionResponse = await fetch(`${config.traccar.baseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });
    if (!sessionResponse.ok) {
      return res.status(sessionResponse.status).json({
        success: false,
        error: 'Traccar user created but signin failed',
      });
    }

    const data = await sessionResponse.json();
    const traccarUser = {
      id: String(data?.id || ''),
      name: data?.name || name,
      email: data?.email || email,
      provider: 'traccar',
    };
    const token = createToken({
      sub: traccarUser.id || traccarUser.email,
      provider: 'traccar',
      traccarEmail: traccarUser.email,
    });
    return res.status(201).json({ success: true, token, user: traccarUser });
  } catch (error) {
    return res
      .status(500)
      .json({ success: false, error: error?.message || 'Traccar signup failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    if (req.auth?.provider === 'traccar') {
      return res.status(200).json({
        success: true,
        user: {
          id: req.auth?.sub || '',
          name: req.auth?.traccarEmail || 'Traccar User',
          email: req.auth?.traccarEmail || '',
          provider: 'traccar',
        },
      });
    }

    const user = await UserModel.findById(req.auth?.sub).lean();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    return res.status(200).json({ success: true, user: sanitizeUser(user) });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load user' });
  }
});

export default router;
