const { PrismaClient } = require('@prisma/client');
const { generateToken, hashPassword, comparePassword } = require('../utils/jwt');

const prisma = new PrismaClient();

class AuthController {
  /**
   * Register a new user
   */
  static async register(req, res) {
    try {
      const { email, password, full_name } = req.body;

      // Validate input
      if (!email || !password || !full_name) {
        return res.status(400).json({
          error: 'Email, password, and full name are required'
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email }
      });

      if (existingUser) {
        return res.status(409).json({
          error: 'User with this email already exists'
        });
      }

      // Hash password
      const password_hash = await hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password_hash,
          full_name
        }
      });

      // Generate token
      const token = generateToken(user.id, user.email);

      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        },
        token
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * Login user
   */
  static async login(req, res) {
    try {
      const { email, password } = req.body;

      // Validate input
      if (!email || !password) {
        return res.status(400).json({
          error: 'Email and password are required'
        });
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        return res.status(401).json({
          error: 'Invalid email or password'
        });
      }

      // Compare password
      const passwordMatch = await comparePassword(password, user.password_hash);

      if (!passwordMatch) {
        return res.status(401).json({
          error: 'Invalid email or password'
        });
      }

      // Generate token
      const token = generateToken(user.id, user.email);

      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name
        },
        token
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * Refresh token
   */
  static async refreshToken(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      const token = generateToken(user.id, user.email);

      res.json({
        message: 'Token refreshed',
        token
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }

  /**
   * Get user profile
   */
  static async getProfile(req, res) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        error: 'Internal server error'
      });
    }
  }
}

module.exports = AuthController;
