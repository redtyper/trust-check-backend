import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import * as bcrypt from 'bcrypt';

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

interface ValidateUserResult {
  id: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly BCRYPT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new user
   * @param email - User email
   * @param password - User password (will be hashed)
   * @returns Login response with access token
   */
  async register(email: string, password: string): Promise<LoginResponse> {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      this.logger.warn(`Registration attempted for existing email: ${email}`);
      throw new BadRequestException('Email is already in use');
    }

    // Hash password
    try {
      const hashedPassword = await bcrypt.hash(password, this.BCRYPT_ROUNDS);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email,
          password: hashedPassword,
        },
      });

      this.logger.log(`User registered successfully: ${email}`);
      return this.generateLoginResponse(user);
    } catch (error) {
      this.logger.error(`Registration error for ${email}:`, error);
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Login user
   * @param user - User object
   * @returns Login response with access token
   */
  async login(user: any): Promise<LoginResponse> {
    if (!user || !user.id || !user.email) {
      throw new UnauthorizedException('Invalid user data');
    }
    return this.generateLoginResponse(user);
  }

  /**
   * Validate user credentials
   * @param email - User email
   * @param password - User password
   * @returns User data without password, or null if invalid
   */
  async validateUser(
    email: string,
    password: string,
  ): Promise<ValidateUserResult | null> {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { email } });

      if (!user) {
        this.logger.warn(`Login attempt for non-existent user: ${email}`);
        return null;
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        this.logger.warn(`Failed login attempt for user: ${email}`);
        return null;
      }

      // Return user without password
      const { password: _, ...result } = user;
      this.logger.log(`User logged in successfully: ${email}`);
      return result as ValidateUserResult;
    } catch (error) {
      this.logger.error(`Validation error for ${email}:`, error);
      throw new Error(`User validation failed: ${error.message}`);
    }
  }

  /**
   * Generate login response with JWT token
   */
  private generateLoginResponse(user: any): LoginResponse {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role || 'user',
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role || 'user',
      },
    };
  }
}
