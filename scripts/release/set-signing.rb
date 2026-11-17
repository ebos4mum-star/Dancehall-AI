# Applies manual App Store signing to the APP target only, in the generated (never committed) Xcode project.
# Command-line signing overrides would also hit every CocoaPods target (which cannot take a provisioning profile), so the settings
# are written to the application target's Release configuration instead. Usage: ruby set-signing.rb <ios dir> <team id> <profile name>
require 'xcodeproj'

ios, team, profile = ARGV
abort 'usage: set-signing.rb <ios dir> <team id> <profile name>' unless ios && team && profile
abort 'team id must be 10 letters or digits' unless team =~ /\A[A-Z0-9]{10}\z/

path = Dir[File.join(ios, '*.xcodeproj')].first or abort 'no .xcodeproj'
project = Xcodeproj::Project.open(path)
apps = project.targets.select { |t| t.product_type == 'com.apple.product-type.application' }
abort "expected exactly one application target, found #{apps.length}" unless apps.length == 1
app = apps.first
release = app.build_configurations.select { |c| c.name == 'Release' }
abort 'no Release configuration' if release.empty?
release.each do |c|
  c.build_settings.delete_if { |k, _| k.start_with?('CODE_SIGN_IDENTITY[') }
  c.build_settings.merge!(
    'CODE_SIGN_STYLE' => 'Manual',
    'DEVELOPMENT_TEAM' => team,
    'CODE_SIGN_IDENTITY' => 'Apple Distribution',
    'PROVISIONING_PROFILE_SPECIFIER' => profile
  )
end
project.save
puts "Manual App Store signing set on target #{app.name} (Release) for team #{team[0, 2]}********."
